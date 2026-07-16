import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSettings } from "@/lib/settings/resolve";
import { waitWindowsFor } from "@/lib/settings/wait-windows";
import { LoggingNotificationService } from "@/lib/notifications/logging-service";
import type {
  NotificationMessage,
  NotificationService,
} from "@/lib/notifications/types";
import { transition } from "./transition";
import { findCoverageCandidates } from "./eligible";

export type SickCallResult =
  | { ok: true; requestId: string; offers: number }
  | { ok: false; error: string };

const ACTIVE_STATUSES =
  "(open,tier1_broadcast,tier2_broadcast,escalated)";

/**
 * Employee reports they can't make a shift. Creates a sick_call coverage_request,
 * snapshots the sick_call wait-windows, opens tier-1 broadcast to eligible
 * same-location employees (offers + notifications), and notifies the manager.
 *
 * Runs service-role: it writes coverage_offers / coverage_audit_log /
 * notifications_log which RLS reserves for managers/service-role. The calling
 * action authorizes the employee first.
 */
export async function reportSickCall(
  supabase: SupabaseClient,
  params: {
    shiftId: string;
    reporterEmployeeId: string;
    notifier?: NotificationService;
  },
): Promise<SickCallResult> {
  // The reporter must actually be assigned to this shift.
  const { data: assignment } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("shift_id", params.shiftId)
    .eq("employee_id", params.reporterEmployeeId)
    .maybeSingle();
  if (!assignment) {
    return { ok: false, error: "That shift isn't assigned to you." };
  }

  // Don't start a second search for a shift that already has one running.
  const { data: active } = await supabase
    .from("coverage_requests")
    .select("id")
    .eq("shift_id", params.shiftId)
    .filter("status", "in", ACTIVE_STATUSES)
    .maybeSingle();
  if (active) {
    return { ok: false, error: "We're already finding cover for this shift." };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const settings = resolveSettings(business?.settings);
  const windows = waitWindowsFor(settings, "sick_call");

  // Create the request (open), snapshotting the wait-windows.
  const { data: request, error: reqError } = await supabase
    .from("coverage_requests")
    .insert({
      shift_id: params.shiftId,
      requested_by: params.reporterEmployeeId,
      trigger_type: "sick_call",
      status: "open",
      tier1_wait_minutes: windows.tier1_minutes,
      tier2_wait_minutes: windows.tier2_minutes,
    })
    .select("id")
    .single();
  if (reqError || !request) {
    return { ok: false, error: reqError?.message ?? "Could not start the request." };
  }

  // Tier-1 candidates: same location, eligible, not the reporter.
  const candidates = await findCoverageCandidates(supabase, {
    shiftId: params.shiftId,
    reporterId: params.reporterEmployeeId,
    sameLocationOnly: true,
  });

  if (candidates.length > 0) {
    const { error: offersError } = await supabase.from("coverage_offers").insert(
      candidates.map((c) => ({
        coverage_request_id: request.id,
        employee_id: c.id,
        tier: 1,
        response: "pending" as const,
      })),
    );
    if (offersError) return { ok: false, error: offersError.message };
  }

  // Move to tier1_broadcast, stamping when this tier's window expires.
  const tierExpiresAt = new Date(
    Date.now() + windows.tier1_minutes * 60_000,
  ).toISOString();
  await transition(supabase, {
    requestId: request.id,
    to: "tier1_broadcast",
    actorEmployeeId: params.reporterEmployeeId,
    patch: { tier_expires_at: tierExpiresAt },
    detail: { candidates: candidates.length },
  });

  // Notify candidates (the ask) and managers (process started).
  const notifier = params.notifier ?? new LoggingNotificationService(supabase);
  const messages: NotificationMessage[] = candidates.map((c) => ({
    recipientEmployeeId: c.id,
    channel: "sms",
    template: "coverage_ask",
    payload: { shiftId: params.shiftId },
    coverageRequestId: request.id,
  }));

  const { data: managers } = await supabase
    .from("employees")
    .select("id")
    .in("role", ["manager", "admin"])
    .eq("active", true);
  for (const m of managers ?? []) {
    messages.push({
      recipientEmployeeId: m.id,
      channel: "email",
      template: "coverage_started",
      payload: { shiftId: params.shiftId, candidates: candidates.length },
      coverageRequestId: request.id,
    });
  }
  await notifier.send(messages);

  return { ok: true, requestId: request.id, offers: candidates.length };
}
