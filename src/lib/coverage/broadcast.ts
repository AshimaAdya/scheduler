import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSettings } from "@/lib/settings/resolve";
import { waitWindowsFor } from "@/lib/settings/wait-windows";
import type { WindowedTrigger } from "@/lib/settings/types";
import { LoggingNotificationService } from "@/lib/notifications/logging-service";
import type {
  NotificationMessage,
  NotificationService,
} from "@/lib/notifications/types";
import { transition } from "./transition";
import { findCoverageCandidates } from "./eligible";

export type BroadcastResult =
  | { ok: true; requestId: string; offers: number }
  | { ok: false; error: string };

const ACTIVE_STATUSES = "(open,tier1_broadcast,tier2_broadcast,escalated)";

/** Ask template per trigger (only the copy differs; the pipeline is identical). */
const ASK_TEMPLATE: Record<WindowedTrigger, string> = {
  sick_call: "coverage_ask",
  day_off: "coverage_ask_day_off",
};

/**
 * The shared tiered-broadcast engine for sick-call and planned day-off. Both
 * triggers run through the SAME pipeline — the only differences are the
 * trigger_type stored and which wait-windows are snapshotted (sick-call short,
 * day-off long). Runs service-role (writes offers/audit/notifications).
 *
 *   verify reporter's shift → no active request → snapshot windows → create
 *   request → find same-location eligible candidates → offers → transition to
 *   tier1_broadcast (stamp tier_expires_at) → notify candidates + managers.
 */
export async function startCoverageBroadcast(
  supabase: SupabaseClient,
  params: {
    shiftId: string;
    reporterEmployeeId: string;
    triggerType: WindowedTrigger;
    notifier?: NotificationService;
  },
): Promise<BroadcastResult> {
  const { data: assignment } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("shift_id", params.shiftId)
    .eq("employee_id", params.reporterEmployeeId)
    .maybeSingle();
  if (!assignment) {
    return { ok: false, error: "That shift isn't assigned to you." };
  }

  const { data: active } = await supabase
    .from("coverage_requests")
    .select("id")
    .eq("shift_id", params.shiftId)
    .filter("status", "in", ACTIVE_STATUSES)
    .maybeSingle();
  if (active) {
    return { ok: false, error: "There's already a request for this shift." };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const settings = resolveSettings(business?.settings);
  const windows = waitWindowsFor(settings, params.triggerType);

  const { data: request, error: reqError } = await supabase
    .from("coverage_requests")
    .insert({
      shift_id: params.shiftId,
      requested_by: params.reporterEmployeeId,
      trigger_type: params.triggerType,
      status: "open",
      tier1_wait_minutes: windows.tier1_minutes,
      tier2_wait_minutes: windows.tier2_minutes,
    })
    .select("id")
    .single();
  if (reqError || !request) {
    return { ok: false, error: reqError?.message ?? "Could not start the request." };
  }

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

  const tierExpiresAt = new Date(
    Date.now() + windows.tier1_minutes * 60_000,
  ).toISOString();
  await transition(supabase, {
    requestId: request.id,
    to: "tier1_broadcast",
    actorEmployeeId: params.reporterEmployeeId,
    patch: { tier_expires_at: tierExpiresAt },
    detail: { trigger: params.triggerType, candidates: candidates.length },
  });

  const notifier = params.notifier ?? new LoggingNotificationService(supabase);
  const messages: NotificationMessage[] = candidates.map((c) => ({
    recipientEmployeeId: c.id,
    channel: "sms",
    template: ASK_TEMPLATE[params.triggerType],
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
      payload: {
        shiftId: params.shiftId,
        trigger: params.triggerType,
        candidates: candidates.length,
      },
      coverageRequestId: request.id,
    });
  }
  await notifier.send(messages);

  return { ok: true, requestId: request.id, offers: candidates.length };
}
