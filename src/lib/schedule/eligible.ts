import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSettings } from "@/lib/settings/resolve";
import {
  conflictsWith,
  durationHours,
  hasSkill,
  isAvailableForSlot,
} from "@/lib/scheduler/eligibility";
import {
  toSchedulerEmployee,
  toSchedulerSlot,
  type AvailabilityRow,
} from "./build-input";

export type EligibleEmployee = { id: string; full_name: string };

const EPSILON = 1e-9;

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Active employees who could take `shiftId` right now — live-checked against the
 * same rules the generator uses: skill match, availability, weekly-hour cap, and
 * no overlap / rest violation with the employee's OTHER shifts that week (the
 * shift being reassigned is excluded from their own hours/intervals). Reuses the
 * scheduler eligibility predicates so the calendar and the generator never drift.
 */
export async function eligibleEmployeesForShift(
  supabase: SupabaseClient,
  shiftId: string,
): Promise<EligibleEmployee[]> {
  const { data: shift } = await supabase
    .from("shifts")
    .select("id, schedule_id, required_skill, starts_at, ends_at")
    .eq("id", shiftId)
    .maybeSingle();
  if (!shift) return [];

  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const settings = resolveSettings(business?.settings);

  const targetSlot = toSchedulerSlot(shift, settings.timezone);
  const targetHours = durationHours(targetSlot.startsAt, targetSlot.endsAt);

  // Week context: every shift + assignment in the same schedule, to compute each
  // employee's already-assigned hours and intervals (excluding this shift).
  const { data: weekShifts } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at")
    .eq("schedule_id", shift.schedule_id);
  const shiftById = new Map((weekShifts ?? []).map((s) => [s.id, s]));
  const weekShiftIds = (weekShifts ?? []).map((s) => s.id);

  const { data: weekAssignments } =
    weekShiftIds.length > 0
      ? await supabase
          .from("shift_assignments")
          .select("shift_id, employee_id")
          .in("shift_id", weekShiftIds)
      : { data: [] };

  const intervalsByEmployee = new Map<string, { startsAt: Date; endsAt: Date }[]>();
  const hoursByEmployee = new Map<string, number>();
  for (const a of weekAssignments ?? []) {
    if (a.shift_id === shiftId) continue; // exclude the shift being (re)assigned
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
    .select("id, full_name, skills, max_weekly_hours")
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

  const eligible: EligibleEmployee[] = [];
  for (const e of employees ?? []) {
    const se = toSchedulerEmployee(e, availabilityByEmployee.get(e.id) ?? []);
    const hours = hoursByEmployee.get(e.id) ?? 0;
    const intervals = intervalsByEmployee.get(e.id) ?? [];
    const fits =
      hasSkill(se.skills, targetSlot.requiredSkill) &&
      isAvailableForSlot(se, targetSlot) &&
      hours + targetHours <= se.maxWeeklyHours + EPSILON &&
      intervals.every((iv) => !conflictsWith(targetSlot, iv));
    if (fits) eligible.push({ id: e.id, full_name: e.full_name });
  }

  return eligible.sort((a, b) => a.full_name.localeCompare(b.full_name));
}
