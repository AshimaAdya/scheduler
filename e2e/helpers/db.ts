import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_ROLE_KEY, GASTOWN } from "../config";

/**
 * Service-role DB helpers for E2E setup + assertions — mirror the *.db.test.ts
 * patterns. Specs seed a clean scenario on a distinct week, act via UI/API, then
 * assert here. Seeding bypasses the app (direct inserts) on purpose; the flows
 * under test are the UI + webhook + cron, not the seed.
 */
export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function cleanupWeek(week: string): Promise<void> {
  const { data: schedules } = await admin
    .from("schedules")
    .select("id")
    .eq("location_id", GASTOWN)
    .eq("week_start", week);
  const ids = (schedules ?? []).map((s) => s.id);
  if (ids.length) {
    const { data: shifts } = await admin.from("shifts").select("id").in("schedule_id", ids);
    const shiftIds = (shifts ?? []).map((s) => s.id);
    if (shiftIds.length) {
      await admin.from("coverage_requests").delete().in("shift_id", shiftIds);
    }
    await admin.from("schedules").delete().in("id", ids); // cascades shifts + assignments
  }
}

export async function createSchedule(week: string): Promise<string> {
  await cleanupWeek(week);
  const { data } = await admin
    .from("schedules")
    .insert({ location_id: GASTOWN, week_start: week, status: "published" })
    .select("id")
    .single();
  return data!.id;
}

export async function createShift(
  scheduleId: string,
  opts: { startsAt: string; endsAt: string; skill?: string },
): Promise<string> {
  const { data } = await admin
    .from("shifts")
    .insert({
      schedule_id: scheduleId,
      location_id: GASTOWN,
      starts_at: opts.startsAt,
      ends_at: opts.endsAt,
      required_skill: opts.skill ?? "barista",
    })
    .select("id")
    .single();
  return data!.id;
}

export async function assign(shiftId: string, employeeId: string): Promise<void> {
  await admin.from("shift_assignments").insert({ shift_id: shiftId, employee_id: employeeId });
}

/** Seed a broadcast already in tier1 with offers, optionally already expired. */
export async function seedBroadcast(opts: {
  shiftId: string;
  reporterId: string;
  trigger: "sick_call" | "day_off";
  offerTo: string[];
  expiredMinutesAgo?: number;
}): Promise<string> {
  const { data: req } = await admin
    .from("coverage_requests")
    .insert({
      shift_id: opts.shiftId,
      requested_by: opts.reporterId,
      trigger_type: opts.trigger,
      status: "tier1_broadcast",
      tier1_wait_minutes: 30,
      tier2_wait_minutes: 30,
      tier_expires_at: new Date(
        Date.now() - (opts.expiredMinutesAgo ?? -30) * 60_000,
      ).toISOString(),
    })
    .select("id")
    .single();
  if (opts.offerTo.length) {
    await admin.from("coverage_offers").insert(
      opts.offerTo.map((id) => ({
        coverage_request_id: req!.id,
        employee_id: id,
        tier: 1,
        response: "pending" as const,
      })),
    );
  }
  return req!.id;
}

/** Seed an open two-way swap proposal addressed to `targetId`. */
export async function seedSwap(opts: {
  aShiftId: string;
  bShiftId: string;
  requesterId: string;
  targetId: string;
}): Promise<string> {
  const { data: req } = await admin
    .from("coverage_requests")
    .insert({
      shift_id: opts.aShiftId,
      requested_by: opts.requesterId,
      trigger_type: "direct_swap",
      trade_type: "two_way",
      status: "open",
      target_employee_id: opts.targetId,
      offered_shift_id: opts.bShiftId,
    })
    .select("id")
    .single();
  await admin
    .from("coverage_offers")
    .insert({ coverage_request_id: req!.id, employee_id: opts.targetId, tier: 1, response: "pending" });
  return req!.id;
}

/** Seed a day-off already covered but not yet approved (for approval-mode checks). */
export async function seedCoveredDayOff(opts: {
  shiftId: string;
  reporterId: string;
  coveredBy: string;
}): Promise<string> {
  const { data: req } = await admin
    .from("coverage_requests")
    .insert({
      shift_id: opts.shiftId,
      requested_by: opts.reporterId,
      trigger_type: "day_off",
      status: "covered",
      covered_by: opts.coveredBy,
      covered_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  return req!.id;
}

export async function expireTierNow(requestId: string): Promise<void> {
  await admin
    .from("coverage_requests")
    .update({ tier_expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", requestId);
}

export async function requestState(
  requestId: string,
): Promise<{ status: string; covered_by: string | null }> {
  const { data } = await admin
    .from("coverage_requests")
    .select("status, covered_by")
    .eq("id", requestId)
    .single();
  return data!;
}

export async function assigneeOf(shiftId: string): Promise<string | null> {
  const { data } = await admin
    .from("shift_assignments")
    .select("employee_id")
    .eq("shift_id", shiftId)
    .maybeSingle();
  return data?.employee_id ?? null;
}

export async function setApprovalMode(mode: "auto_publish" | "require_approval"): Promise<void> {
  const { data: business } = await admin
    .from("businesses")
    .select("id, settings")
    .limit(1)
    .single();
  const settings = { ...(business!.settings as Record<string, unknown>), approval_mode: mode };
  await admin.from("businesses").update({ settings }).eq("id", business!.id);
}
