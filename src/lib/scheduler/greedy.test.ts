import { describe, it, expect } from "vitest";
import { GreedyScheduleGenerator } from "./greedy";
import type { SchedulerEmployee, SchedulerSlot } from "./types";

const gen = new GreedyScheduleGenerator();

// Available every weekday, all day.
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
  weekday,
  start: "00:00",
  end: "23:59",
}));

function emp(id: string, over: Partial<SchedulerEmployee> = {}): SchedulerEmployee {
  return {
    id,
    skills: ["cashier"],
    maxWeeklyHours: 40,
    recurring: ALL_DAYS,
    exceptions: [],
    ...over,
  };
}

/** A 4h slot on 2026-07-(13+dayOffset), 16:00–20:00 UTC. */
function slot(id: string, dayOffset = 0, over: Partial<SchedulerSlot> = {}): SchedulerSlot {
  const day = 13 + dayOffset;
  const dd = String(day).padStart(2, "0");
  return {
    id,
    requiredSkill: "cashier",
    startsAt: new Date(`2026-07-${dd}T16:00:00Z`),
    endsAt: new Date(`2026-07-${dd}T20:00:00Z`),
    localWeekday: 1,
    localStart: "09:00",
    localEnd: "13:00",
    localDate: `2026-07-${dd}`,
    ...over,
  };
}

describe("GreedyScheduleGenerator — eligibility exclusions", () => {
  it("excludes a skill mismatch", () => {
    const res = gen.generate({
      slots: [slot("s1", 0, { requiredSkill: "barista" })],
      employees: [emp("cashierOnly"), emp("barista", { skills: ["barista"] })],
    });
    expect(res.assignments).toEqual([{ slotId: "s1", employeeId: "barista" }]);
  });

  it("excludes an employee who would exceed their weekly hour cap", () => {
    const res = gen.generate({
      slots: [slot("s1")], // 4h
      employees: [emp("tight", { maxWeeklyHours: 3 })],
    });
    expect(res.assignments).toEqual([]);
    expect(res.unfilled).toEqual(["s1"]);
  });

  it("excludes an employee not available that weekday", () => {
    const res = gen.generate({
      slots: [slot("s1", 0, { localWeekday: 1 })],
      employees: [
        emp("tuesOnly", { recurring: [{ weekday: 2, start: "00:00", end: "23:59" }] }),
      ],
    });
    expect(res.unfilled).toEqual(["s1"]);
  });

  it("excludes an overlapping assignment for the same employee", () => {
    const a = slot("s1", 0); // 16:00–20:00
    const b = slot("s2", 0, {
      startsAt: new Date("2026-07-13T18:00:00Z"),
      endsAt: new Date("2026-07-13T22:00:00Z"),
    });
    const res = gen.generate({ slots: [a, b], employees: [emp("solo")] });
    expect(res.assignments).toEqual([{ slotId: "s1", employeeId: "solo" }]);
    expect(res.unfilled).toEqual(["s2"]);
  });

  it("excludes a rest-period violation (under 10h between shifts)", () => {
    const a = slot("s1", 0, {
      startsAt: new Date("2026-07-13T14:00:00Z"),
      endsAt: new Date("2026-07-13T22:00:00Z"),
    });
    // Starts 8h later.
    const b = slot("s2", 1, {
      startsAt: new Date("2026-07-14T06:00:00Z"),
      endsAt: new Date("2026-07-14T10:00:00Z"),
    });
    const res = gen.generate({ slots: [a, b], employees: [emp("solo")] });
    expect(res.assignments).toEqual([{ slotId: "s1", employeeId: "solo" }]);
    expect(res.unfilled).toEqual(["s2"]);
  });

  it("flags an unfillable slot instead of dropping it", () => {
    const res = gen.generate({
      slots: [slot("s1", 0, { requiredSkill: "welder" })],
      employees: [emp("a"), emp("b")],
    });
    expect(res.assignments).toEqual([]);
    expect(res.unfilled).toEqual(["s1"]);
  });
});

describe("GreedyScheduleGenerator — fairness & reproducibility", () => {
  it("spreads hours within 20% across equally-available employees", () => {
    const employees = [emp("a"), emp("b"), emp("c")];
    const slots = Array.from({ length: 6 }, (_, i) => slot(`s${i}`, i)); // 6 × 4h, distinct days
    const res = gen.generate({ slots, employees, seed: 7 });

    expect(res.unfilled).toEqual([]);
    const hoursById = new Map<string, number>(employees.map((e) => [e.id, 0]));
    for (const a of res.assignments) {
      hoursById.set(a.employeeId, hoursById.get(a.employeeId)! + 4);
    }
    const totals = [...hoursById.values()];
    const max = Math.max(...totals);
    const min = Math.min(...totals);
    const mean = totals.reduce((s, h) => s + h, 0) / totals.length;
    expect((max - min) / mean).toBeLessThanOrEqual(0.2);
  });

  it("produces an identical schedule for the same seed", () => {
    const employees = [emp("a"), emp("b"), emp("c")];
    const slots = Array.from({ length: 5 }, (_, i) => slot(`s${i}`, i));
    const first = gen.generate({ slots, employees, seed: 42 });
    const second = gen.generate({ slots, employees, seed: 42 });
    expect(second).toEqual(first);
  });

  it("respects existing assignments when balancing hours", () => {
    // 'a' already worked 8h this week, so a fresh single slot should go to 'b'.
    const res = gen.generate({
      slots: [slot("s1")],
      employees: [emp("a"), emp("b")],
      existingAssignments: [
        {
          employeeId: "a",
          startsAt: new Date("2026-07-06T16:00:00Z"),
          endsAt: new Date("2026-07-07T00:00:00Z"),
        },
      ],
      seed: 3,
    });
    expect(res.assignments).toEqual([{ slotId: "s1", employeeId: "b" }]);
  });
});
