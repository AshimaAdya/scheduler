import {
  conflictsWith,
  durationHours,
  hasSkill,
  isAvailableForSlot,
} from "@/lib/scheduler/eligibility";
import type { SchedulerEmployee, SchedulerSlot } from "@/lib/scheduler/types";

const EPSILON = 1e-9;

/**
 * Whether one employee can take one slot, given the hours/intervals they already
 * hold that week. Single source of truth for "eligible for this shift" — used by
 * the manager reassign picker, the employee claim flow, and the employee view.
 */
export function employeeFitsSlot(
  employee: SchedulerEmployee,
  slot: SchedulerSlot,
  context: { hours: number; intervals: { startsAt: Date; endsAt: Date }[] },
): boolean {
  const slotHours = durationHours(slot.startsAt, slot.endsAt);
  return (
    hasSkill(employee.skills, slot.requiredSkill) &&
    isAvailableForSlot(employee, slot) &&
    context.hours + slotHours <= employee.maxWeeklyHours + EPSILON &&
    context.intervals.every((iv) => !conflictsWith(slot, iv))
  );
}
