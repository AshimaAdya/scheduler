import { describe, it, expect } from "vitest";
import { toSchedulerSlot, toSchedulerEmployee } from "./build-input";

const TZ = "America/Vancouver";

describe("toSchedulerSlot", () => {
  it("derives local weekday/time/date from UTC instants", () => {
    // 2026-07-13 is a Monday. 16:00Z = 09:00 PDT.
    const slot = toSchedulerSlot(
      {
        id: "shift1",
        required_skill: "cashier",
        starts_at: "2026-07-13T16:00:00Z",
        ends_at: "2026-07-13T20:00:00Z",
      },
      TZ,
    );
    expect(slot.id).toBe("shift1");
    expect(slot.localDate).toBe("2026-07-13");
    expect(slot.localWeekday).toBe(1); // Monday
    expect(slot.localStart).toBe("09:00");
    expect(slot.localEnd).toBe("13:00");
  });

  it("uses the local date across a UTC day boundary", () => {
    // 2026-07-14T06:00Z = 2026-07-13 23:00 PDT (still Monday locally).
    const slot = toSchedulerSlot(
      {
        id: "s2",
        required_skill: "barista",
        starts_at: "2026-07-14T06:00:00Z",
        ends_at: "2026-07-14T07:00:00Z",
      },
      TZ,
    );
    expect(slot.localDate).toBe("2026-07-13");
    expect(slot.localWeekday).toBe(1);
    expect(slot.localStart).toBe("23:00");
  });
});

describe("toSchedulerEmployee", () => {
  it("splits recurring and exception rules and coerces hours", () => {
    const emp = toSchedulerEmployee(
      { id: "e1", skills: ["cashier"], max_weekly_hours: "32.00" },
      [
        { kind: "recurring", weekday: 1, exception_date: null, start_time: "09:00:00", end_time: "17:00:00", is_available: true },
        { kind: "exception", weekday: null, exception_date: "2026-07-15", start_time: null, end_time: null, is_available: false },
      ],
    );
    expect(emp.maxWeeklyHours).toBe(32);
    expect(emp.recurring).toEqual([{ weekday: 1, start: "09:00", end: "17:00" }]);
    expect(emp.exceptions).toEqual([{ date: "2026-07-15", isAvailable: false }]);
  });
});
