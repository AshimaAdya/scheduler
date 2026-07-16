/**
 * Schedule generator contract. The MVP implementation is greedy
 * (`GreedyScheduleGenerator`); it can later be swapped for a constraint solver
 * (e.g. OR-Tools) without touching callers, as long as it satisfies this shape.
 */

/** Minimum rest between two shifts for the same employee. */
export const MIN_REST_HOURS = 10;

/**
 * A concrete slot to fill. UTC instants drive hours/overlap/rest; the pre-derived
 * local fields drive availability matching, so the generator itself is
 * timezone-free (the caller derives locals once via date-fns-tz).
 */
export type SchedulerSlot = {
  id: string;
  requiredSkill: string;
  startsAt: Date;
  endsAt: Date;
  localWeekday: number; // 0 = Sunday … 6 = Saturday
  localStart: string; // "HH:MM"
  localEnd: string; // "HH:MM"
  localDate: string; // "YYYY-MM-DD"
};

export type SchedulerAvailability = {
  recurring: { weekday: number; start: string; end: string }[];
  exceptions: { date: string; isAvailable: boolean }[];
};

export type SchedulerEmployee = {
  id: string;
  skills: string[];
  maxWeeklyHours: number;
} & SchedulerAvailability;

/** A pre-existing assignment (e.g. manual) whose hours/time must be respected. */
export type ExistingAssignment = {
  employeeId: string;
  startsAt: Date;
  endsAt: Date;
};

export type GenerateInput = {
  slots: SchedulerSlot[];
  employees: SchedulerEmployee[];
  existingAssignments?: ExistingAssignment[];
  /** Seed for reproducible tie-breaking. Defaults to a fixed value. */
  seed?: number;
};

export type SlotAssignment = { slotId: string; employeeId: string };

export type GenerateResult = {
  assignments: SlotAssignment[];
  /** Slot ids with no eligible employee — flagged, never silently dropped. */
  unfilled: string[];
};

export interface ScheduleGenerator {
  generate(input: GenerateInput): GenerateResult;
}
