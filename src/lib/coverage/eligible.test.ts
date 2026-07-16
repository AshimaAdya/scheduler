import { describe, it, expect } from "vitest";
import { isCoverageEligible, type CoverageCandidate } from "./eligible";
import type { SchedulerSlot } from "@/lib/scheduler/types";

const SLOT: SchedulerSlot = {
  id: "shift1",
  requiredSkill: "barista",
  startsAt: new Date("2026-09-08T16:00:00Z"),
  endsAt: new Date("2026-09-09T00:00:00Z"),
  localWeekday: 2, // Tuesday
  localStart: "09:00",
  localEnd: "17:00",
  localDate: "2026-09-08",
};

function candidate(over: Partial<CoverageCandidate> = {}): CoverageCandidate {
  return {
    id: "cand",
    skills: ["barista"],
    maxWeeklyHours: 40,
    recurring: [{ weekday: 2, start: "08:00", end: "18:00" }],
    exceptions: [],
    homeLocationId: "loc-1",
    active: true,
    ...over,
  };
}

const NONE = { hours: 0, intervals: [] };
const OPTS = { reporterId: "reporter", shiftLocationId: "loc-1", sameLocationOnly: true };

describe("isCoverageEligible", () => {
  it("accepts a matching, available, same-location candidate", () => {
    expect(isCoverageEligible(candidate(), SLOT, NONE, OPTS)).toBe(true);
  });

  it("excludes the reporter (never covers their own shift)", () => {
    expect(
      isCoverageEligible(candidate({ id: "reporter" }), SLOT, NONE, OPTS),
    ).toBe(false);
  });

  it("excludes inactive employees", () => {
    expect(isCoverageEligible(candidate({ active: false }), SLOT, NONE, OPTS)).toBe(false);
  });

  it("excludes a skill mismatch", () => {
    expect(isCoverageEligible(candidate({ skills: ["cashier"] }), SLOT, NONE, OPTS)).toBe(false);
  });

  it("excludes an availability conflict", () => {
    expect(
      isCoverageEligible(candidate({ recurring: [{ weekday: 3, start: "08:00", end: "18:00" }] }), SLOT, NONE, OPTS),
    ).toBe(false);
  });

  it("excludes an employee over their hour cap", () => {
    // Shift is 8h; a 36h cap with 32h already assigned leaves no room.
    expect(
      isCoverageEligible(candidate({ maxWeeklyHours: 36 }), SLOT, { hours: 32, intervals: [] }, OPTS),
    ).toBe(false);
  });

  it("excludes an overlapping / rest-violating assignment", () => {
    const intervals = [
      { startsAt: new Date("2026-09-08T18:00:00Z"), endsAt: new Date("2026-09-09T02:00:00Z") },
    ];
    expect(isCoverageEligible(candidate(), SLOT, { hours: 8, intervals }, OPTS)).toBe(false);
  });

  it("excludes other locations for tier 1 (same-location only)", () => {
    expect(
      isCoverageEligible(candidate({ homeLocationId: "loc-2" }), SLOT, NONE, OPTS),
    ).toBe(false);
  });

  it("allows other locations when the tier opens up (sameLocationOnly false)", () => {
    expect(
      isCoverageEligible(candidate({ homeLocationId: "loc-2" }), SLOT, NONE, {
        ...OPTS,
        sameLocationOnly: false,
      }),
    ).toBe(true);
  });
});
