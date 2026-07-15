import { formatInTimeZone } from "date-fns-tz";
import type {
  SchedulerEmployee,
  SchedulerSlot,
} from "@/lib/scheduler/types";

/** A generated shift that already exists as a DB `shifts` row. */
export type ShiftRow = {
  id: string;
  required_skill: string;
  starts_at: string | Date;
  ends_at: string | Date;
};

/** Rows from `availability_rules` for a single employee. */
export type AvailabilityRow = {
  kind: string;
  weekday: number | null;
  exception_date: string | null;
  start_time: string | null;
  end_time: string | null;
  is_available: boolean;
};

const hhmm = (t: string) => t.slice(0, 5);

/**
 * Derive the local wall-clock fields the scheduler needs from a shift's UTC
 * instants, using the business timezone. Keeps the generator timezone-free.
 */
export function toSchedulerSlot(shift: ShiftRow, timezone: string): SchedulerSlot {
  const startsAt = new Date(shift.starts_at);
  const endsAt = new Date(shift.ends_at);
  const localDate = formatInTimeZone(startsAt, timezone, "yyyy-MM-dd");
  return {
    id: shift.id,
    requiredSkill: shift.required_skill,
    startsAt,
    endsAt,
    // Weekday of the local date (noon avoids any DST edge).
    localWeekday: new Date(`${localDate}T12:00:00Z`).getUTCDay(),
    localStart: formatInTimeZone(startsAt, timezone, "HH:mm"),
    localEnd: formatInTimeZone(endsAt, timezone, "HH:mm"),
    localDate,
  };
}

export function toSchedulerEmployee(
  employee: { id: string; skills: string[]; max_weekly_hours: number | string },
  availability: AvailabilityRow[],
): SchedulerEmployee {
  const recurring = availability
    .filter((r) => r.kind === "recurring" && r.weekday != null && r.start_time && r.end_time)
    .map((r) => ({
      weekday: r.weekday as number,
      start: hhmm(r.start_time as string),
      end: hhmm(r.end_time as string),
    }));

  const exceptions = availability
    .filter((r) => r.kind === "exception" && r.exception_date)
    .map((r) => ({ date: r.exception_date as string, isAvailable: r.is_available }));

  return {
    id: employee.id,
    skills: employee.skills,
    maxWeeklyHours: Number(employee.max_weekly_hours),
    recurring,
    exceptions,
  };
}
