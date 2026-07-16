import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSettings } from "@/lib/settings/resolve";
import { durationHours } from "@/lib/scheduler/eligibility";
import { employeeFitsSlot } from "@/lib/schedule/fits";
import {
  toSchedulerEmployee,
  toSchedulerSlot,
  type AvailabilityRow,
} from "@/lib/schedule/build-input";
import type { SchedulerEmployee, SchedulerSlot } from "@/lib/scheduler/types";

/** An employee considered as a coverage candidate. */
export type CoverageCandidate = SchedulerEmployee & {
  homeLocationId: string | null;
  active: boolean;
};

export type CoverageEligibilityOptions = {
  /** The employee who reported out — never eligible for their own coverage. */
  reporterId: string;
  /** Location of the shift needing coverage. */
  shiftLocationId: string;
  /** Tier 1 restricts to the same location; tier 2 opens to other locations. */
  sameLocationOnly: boolean;
};

/**
 * Whether a candidate can cover a shift. Pure, so every exclusion rule is unit
 * testable. Wraps the shared `employeeFitsSlot` (skill/availability/hour-cap/
 * overlap-rest) with the coverage-specific rules: active, not the reporter, and
 * the location scope for the current tier.
 */
export function isCoverageEligible(
  candidate: CoverageCandidate,
  slot: SchedulerSlot,
  context: { hours: number; intervals: { startsAt: Date; endsAt: Date }[] },
  opts: CoverageEligibilityOptions,
): boolean {
  if (!candidate.active) return false;
  if (candidate.id === opts.reporterId) return false;
  if (opts.sameLocationOnly && candidate.homeLocationId !== opts.shiftLocationId) {
    return false;
  }
  return employeeFitsSlot(candidate, slot, context);
}

export type CoverageCandidateResult = { id: string; full_name: string };

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Find employees eligible to cover a shift for the given tier. Loads the data and
 * applies `isCoverageEligible`. Uses a service-role or manager client (reads
 * across employees/availability).
 */
export async function findCoverageCandidates(
  supabase: SupabaseClient,
  params: { shiftId: string; reporterId: string; sameLocationOnly: boolean },
): Promise<CoverageCandidateResult[]> {
  const { data: shift } = await supabase
    .from("shifts")
    .select("id, schedule_id, location_id, required_skill, starts_at, ends_at")
    .eq("id", params.shiftId)
    .maybeSingle();
  if (!shift) return [];

  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const timezone = resolveSettings(business?.settings).timezone;
  const slot = toSchedulerSlot(shift, timezone);

  // Each candidate's existing hours/intervals in this schedule (week).
  const { data: weekShifts } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at")
    .eq("schedule_id", shift.schedule_id);
  const shiftById = new Map((weekShifts ?? []).map((s) => [s.id, s]));
  const weekShiftIds = (weekShifts ?? []).map((s) => s.id);

  const { data: assignments } =
    weekShiftIds.length > 0
      ? await supabase
          .from("shift_assignments")
          .select("shift_id, employee_id")
          .in("shift_id", weekShiftIds)
      : { data: [] };

  const intervalsByEmployee = new Map<string, { startsAt: Date; endsAt: Date }[]>();
  const hoursByEmployee = new Map<string, number>();
  for (const a of assignments ?? []) {
    if (a.shift_id === params.shiftId) continue; // the shift being covered
    const s = shiftById.get(a.shift_id);
    if (!s) continue;
    const startsAt = new Date(s.starts_at);
    const endsAt = new Date(s.ends_at);
    push(intervalsByEmployee, a.employee_id, { startsAt, endsAt });
    hoursByEmployee.set(
      a.employee_id,
      (hoursByEmployee.get(a.employee_id) ?? 0) + durationHours(startsAt, endsAt),
    );
  }

  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, skills, max_weekly_hours, home_location_id, active")
    .eq("active", true);
  const empIds = (employees ?? []).map((e) => e.id);

  const { data: availability } =
    empIds.length > 0
      ? await supabase
          .from("availability_rules")
          .select("employee_id, kind, weekday, exception_date, start_time, end_time, is_available")
          .in("employee_id", empIds)
      : { data: [] };
  const availabilityByEmployee = new Map<string, AvailabilityRow[]>();
  for (const r of availability ?? []) push(availabilityByEmployee, r.employee_id, r);

  const result: CoverageCandidateResult[] = [];
  for (const e of employees ?? []) {
    const candidate: CoverageCandidate = {
      ...toSchedulerEmployee(e, availabilityByEmployee.get(e.id) ?? []),
      homeLocationId: e.home_location_id,
      active: e.active,
    };
    const eligible = isCoverageEligible(
      candidate,
      slot,
      {
        hours: hoursByEmployee.get(e.id) ?? 0,
        intervals: intervalsByEmployee.get(e.id) ?? [],
      },
      {
        reporterId: params.reporterId,
        shiftLocationId: shift.location_id,
        sameLocationOnly: params.sameLocationOnly,
      },
    );
    if (eligible) result.push({ id: e.id, full_name: e.full_name });
  }

  return result.sort((a, b) => a.full_name.localeCompare(b.full_name));
}
