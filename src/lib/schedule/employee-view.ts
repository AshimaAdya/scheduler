import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { resolveSettings } from "@/lib/settings/resolve";
import { durationHours } from "@/lib/scheduler/eligibility";
import {
  toSchedulerEmployee,
  toSchedulerSlot,
  type AvailabilityRow,
  type ShiftRow,
} from "./build-input";
import { employeeFitsSlot } from "./fits";

export type EmployeeShift = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  skill: string;
  locationName: string | null;
  pendingApproval: boolean;
  /** Active coverage status for this shift (the employee reported out), or null. */
  coverageStatus: string | null;
  /** Which trigger opened that coverage request (sick_call | day_off | direct_swap). */
  coverageTrigger: string | null;
};

export type ClaimableShift = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  skill: string;
  locationName: string | null;
};

export type EmployeeScheduleView = {
  own: EmployeeShift[];
  claimable: ClaimableShift[];
};

type VisibleShift = ShiftRow & {
  schedule_id: string;
  location_id: string;
  locations: { name: string } | { name: string }[] | null;
};

function locationName(shift: VisibleShift): string | null {
  const loc = shift.locations;
  return Array.isArray(loc) ? (loc[0]?.name ?? null) : (loc?.name ?? null);
}

/**
 * The signed-in employee's schedule: their own upcoming shifts plus open shifts
 * they're eligible to claim. Must be called with the employee's own
 * (authenticated) client so RLS guarantees no other employee's assignment data
 * is ever returned (invariant #3). Eligibility reuses the scheduler predicates.
 */
export async function getEmployeeSchedule(
  client: SupabaseClient,
  employeeId: string,
): Promise<EmployeeScheduleView> {
  const nowIso = new Date().toISOString();

  const { data: business } = await client
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const timezone = resolveSettings(business?.settings).timezone;

  const { data: employeeRow } = await client
    .from("employees")
    .select("id, skills, max_weekly_hours")
    .eq("id", employeeId)
    .maybeSingle();

  const { data: availability } = await client
    .from("availability_rules")
    .select("kind, weekday, exception_date, start_time, end_time, is_available")
    .eq("employee_id", employeeId);

  const { data: ownAssignments } = await client
    .from("shift_assignments")
    .select("shift_id, pending_approval")
    .eq("employee_id", employeeId);
  const ownShiftIds = new Set((ownAssignments ?? []).map((a) => a.shift_id));
  const pendingByShift = new Map(
    (ownAssignments ?? []).map((a) => [a.shift_id, a.pending_approval]),
  );

  // Active coverage requests this employee started (RLS: requested_by = self).
  const { data: coverageRows } = await client
    .from("coverage_requests")
    .select("shift_id, status, trigger_type")
    .eq("requested_by", employeeId)
    .in("status", ["open", "tier1_broadcast", "tier2_broadcast", "escalated"]);
  const coverageByShift = new Map(
    (coverageRows ?? []).map((c) => [c.shift_id, { status: c.status, trigger: c.trigger_type }]),
  );

  // RLS returns only: the employee's own-assigned shifts + open (unassigned)
  // shifts, both in PUBLISHED schedules. Never another employee's shifts.
  const { data: visibleShifts } = await client
    .from("shifts")
    .select(
      "id, starts_at, ends_at, required_skill, schedule_id, location_id, schedules!inner(status), locations:location_id(name)",
    )
    .eq("schedules.status", "published")
    .gte("starts_at", nowIso)
    .order("starts_at");

  const shifts = (visibleShifts ?? []) as unknown as VisibleShift[];

  const own: EmployeeShift[] = [];
  const openShifts: VisibleShift[] = [];
  for (const s of shifts) {
    if (ownShiftIds.has(s.id)) {
      own.push({
        id: s.id,
        dateLabel: formatInTimeZone(new Date(s.starts_at), timezone, "EEE MMM d"),
        timeLabel: `${formatInTimeZone(new Date(s.starts_at), timezone, "HH:mm")}–${formatInTimeZone(new Date(s.ends_at), timezone, "HH:mm")}`,
        skill: s.required_skill,
        locationName: locationName(s),
        pendingApproval: pendingByShift.get(s.id) ?? false,
        coverageStatus: coverageByShift.get(s.id)?.status ?? null,
        coverageTrigger: coverageByShift.get(s.id)?.trigger ?? null,
      });
    } else {
      openShifts.push(s);
    }
  }

  // Eligibility for the open shifts. Weekly hours are scoped per schedule (week):
  // the employee's own shifts in the same schedule as the open shift.
  const ownIntervalsBySchedule = new Map<string, { startsAt: Date; endsAt: Date }[]>();
  const ownHoursBySchedule = new Map<string, number>();
  for (const s of shifts) {
    if (!ownShiftIds.has(s.id)) continue;
    const startsAt = new Date(s.starts_at);
    const endsAt = new Date(s.ends_at);
    const list = ownIntervalsBySchedule.get(s.schedule_id) ?? [];
    list.push({ startsAt, endsAt });
    ownIntervalsBySchedule.set(s.schedule_id, list);
    ownHoursBySchedule.set(
      s.schedule_id,
      (ownHoursBySchedule.get(s.schedule_id) ?? 0) + durationHours(startsAt, endsAt),
    );
  }

  const schedulerEmployee = employeeRow
    ? toSchedulerEmployee(employeeRow, (availability ?? []) as AvailabilityRow[])
    : null;

  const claimable: ClaimableShift[] = [];
  if (schedulerEmployee) {
    for (const s of openShifts) {
      const slot = toSchedulerSlot(s, timezone);
      const hours = ownHoursBySchedule.get(s.schedule_id) ?? 0;
      const intervals = ownIntervalsBySchedule.get(s.schedule_id) ?? [];
      if (employeeFitsSlot(schedulerEmployee, slot, { hours, intervals })) {
        claimable.push({
          id: s.id,
          dateLabel: formatInTimeZone(new Date(s.starts_at), timezone, "EEE MMM d"),
          timeLabel: `${formatInTimeZone(new Date(s.starts_at), timezone, "HH:mm")}–${formatInTimeZone(new Date(s.ends_at), timezone, "HH:mm")}`,
          skill: s.required_skill,
          locationName: locationName(s),
        });
      }
    }
  }

  return { own, claimable };
}
