import {
  MIN_REST_HOURS,
  type SchedulerAvailability,
  type SchedulerSlot,
} from "./types";

const MS_PER_HOUR = 3_600_000;
const MIN_REST_MS = MIN_REST_HOURS * MS_PER_HOUR;

export function durationHours(startsAt: Date, endsAt: Date): number {
  return (endsAt.getTime() - startsAt.getTime()) / MS_PER_HOUR;
}

export function hasSkill(skills: string[], requiredSkill: string): boolean {
  return skills.includes(requiredSkill);
}

/**
 * Is the employee available for the slot?
 *  - A blackout exception on the slot's date makes them unavailable, full stop.
 *  - A positive exception on that date makes them available all day.
 *  - Otherwise a recurring rule must fully cover the slot's weekday + time range.
 */
export function isAvailableForSlot(
  availability: SchedulerAvailability,
  slot: SchedulerSlot,
): boolean {
  let positiveException = false;
  for (const ex of availability.exceptions) {
    if (ex.date !== slot.localDate) continue;
    if (!ex.isAvailable) return false; // blackout wins
    positiveException = true;
  }
  if (positiveException) return true;

  return availability.recurring.some(
    (r) =>
      r.weekday === slot.localWeekday &&
      r.start <= slot.localStart &&
      r.end >= slot.localEnd,
  );
}

type Interval = { startsAt: Date; endsAt: Date };

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

/**
 * True if placing `slot` conflicts with an already-assigned `interval` — either
 * they overlap, or the gap between them is under the minimum rest.
 */
export function conflictsWith(slot: Interval, interval: Interval): boolean {
  if (overlaps(slot, interval)) return true;
  const gap =
    slot.startsAt >= interval.endsAt
      ? slot.startsAt.getTime() - interval.endsAt.getTime()
      : interval.startsAt.getTime() - slot.endsAt.getTime();
  return gap < MIN_REST_MS;
}
