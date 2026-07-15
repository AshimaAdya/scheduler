import { mulberry32 } from "./rng";
import {
  conflictsWith,
  durationHours,
  hasSkill,
  isAvailableForSlot,
} from "./eligibility";
import type {
  GenerateInput,
  GenerateResult,
  ScheduleGenerator,
  SchedulerSlot,
} from "./types";

const DEFAULT_SEED = 1;
const EPSILON = 1e-9;

type Interval = { startsAt: Date; endsAt: Date };

/**
 * Greedy MVP scheduler: for each slot in chronological order, assign the eligible
 * employee with the fewest hours already assigned this week; ties broken by a
 * seeded random priority (so the same seed yields the same schedule). Eligibility
 * = skill match, available, under the weekly-hours cap, and no overlap or
 * rest-period violation with the employee's other shifts. Unfillable slots are
 * flagged, never silently dropped.
 */
export class GreedyScheduleGenerator implements ScheduleGenerator {
  generate(input: GenerateInput): GenerateResult {
    const rng = mulberry32(input.seed ?? DEFAULT_SEED);

    // Stable per-employee tie-break priority, seeded for reproducibility.
    const priority = new Map<string, number>();
    const hours = new Map<string, number>();
    const intervals = new Map<string, Interval[]>();
    for (const e of input.employees) {
      priority.set(e.id, rng());
      hours.set(e.id, 0);
      intervals.set(e.id, []);
    }

    // Fold in existing assignments so their hours/time are respected.
    for (const a of input.existingAssignments ?? []) {
      if (!hours.has(a.employeeId)) continue;
      hours.set(
        a.employeeId,
        hours.get(a.employeeId)! + durationHours(a.startsAt, a.endsAt),
      );
      intervals.get(a.employeeId)!.push({ startsAt: a.startsAt, endsAt: a.endsAt });
    }

    const slots: SchedulerSlot[] = [...input.slots].sort(
      (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
    );

    const assignments: GenerateResult["assignments"] = [];
    const unfilled: string[] = [];

    for (const slot of slots) {
      const slotHours = durationHours(slot.startsAt, slot.endsAt);

      const eligible = input.employees.filter(
        (e) =>
          hasSkill(e.skills, slot.requiredSkill) &&
          isAvailableForSlot(e, slot) &&
          hours.get(e.id)! + slotHours <= e.maxWeeklyHours + EPSILON &&
          intervals.get(e.id)!.every((iv) => !conflictsWith(slot, iv)),
      );

      if (eligible.length === 0) {
        unfilled.push(slot.id);
        continue;
      }

      eligible.sort((a, b) => {
        const diff = hours.get(a.id)! - hours.get(b.id)!;
        if (Math.abs(diff) > EPSILON) return diff;
        return priority.get(a.id)! - priority.get(b.id)!;
      });

      const chosen = eligible[0];
      assignments.push({ slotId: slot.id, employeeId: chosen.id });
      hours.set(chosen.id, hours.get(chosen.id)! + slotHours);
      intervals.get(chosen.id)!.push({ startsAt: slot.startsAt, endsAt: slot.endsAt });
    }

    return { assignments, unfilled };
  }
}
