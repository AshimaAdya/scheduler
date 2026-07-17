import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationService } from "@/lib/notifications/types";
import { startCoverageBroadcast, type BroadcastResult } from "./broadcast";

export type DayOffResult = BroadcastResult;

/**
 * Employee requests a future scheduled shift off. Same pipeline as a sick call
 * but trigger_type day_off and the LONGER day_off wait-windows. The time-off is
 * NOT approved here — it stays "pending, finding coverage" until covered, and is
 * only approved via approveDayOff (invariant #1, enforced by a DB CHECK).
 */
export async function requestDayOff(
  supabase: SupabaseClient,
  params: {
    shiftId: string;
    reporterEmployeeId: string;
    notifier?: NotificationService;
  },
): Promise<DayOffResult> {
  return startCoverageBroadcast(supabase, {
    ...params,
    triggerType: "day_off",
  });
}

export type ApproveResult = { ok: true } | { ok: false; error: string };

/**
 * Approve a day-off request (set time_off_approved_at). This is only ever legal
 * once the request is 'covered' — the DB CHECK `time_off_approved_requires_coverage`
 * rejects it otherwise, so approval can never precede coverage even under a race
 * or a direct write. Used for the manager-confirmation step (require_approval) and
 * for auto-approval on cover (auto_publish, wired in SCH-22).
 */
export async function approveDayOff(
  supabase: SupabaseClient,
  params: { requestId: string; actorEmployeeId?: string | null },
): Promise<ApproveResult> {
  const { data: req } = await supabase
    .from("coverage_requests")
    .select("id, trigger_type, status, time_off_approved_at")
    .eq("id", params.requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found." };
  if (req.trigger_type !== "day_off") {
    return { ok: false, error: "Not a day-off request." };
  }
  if (req.time_off_approved_at) return { ok: true }; // already approved
  if (req.status !== "covered") {
    return { ok: false, error: "Coverage isn't confirmed yet." };
  }

  const { error } = await supabase
    .from("coverage_requests")
    .update({ time_off_approved_at: new Date().toISOString() })
    .eq("id", params.requestId);
  if (error) {
    // The DB CHECK also rejects approval before coverage (race safety).
    return { ok: false, error: "Coverage isn't confirmed yet." };
  }

  return { ok: true };
}
