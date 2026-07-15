import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { generateWeekSlots, type ShiftTemplate } from "./generate-slots";

const TZ = "America/Vancouver";

const tpl = (over: Partial<ShiftTemplate> = {}): ShiftTemplate => ({
  id: "t1",
  location_id: "loc1",
  weekday: 1,
  start_time: "09:00",
  end_time: "17:00",
  required_skill: "cashier",
  headcount: 1,
  ...over,
});

describe("generateWeekSlots — basics", () => {
  it("maps weekday to the right date in a Monday-start week", () => {
    // Week of Mon 2026-07-13. weekday 1 (Mon) → the 13th.
    const [slot] = generateWeekSlots([tpl({ weekday: 1 })], "2026-07-13", TZ);
    expect(formatInTimeZone(slot.starts_at, TZ, "yyyy-MM-dd")).toBe("2026-07-13");
    // weekday 0 (Sun) → the following Sunday, the 19th.
    const [sun] = generateWeekSlots([tpl({ weekday: 0 })], "2026-07-13", TZ);
    expect(formatInTimeZone(sun.starts_at, TZ, "yyyy-MM-dd")).toBe("2026-07-19");
  });

  it("expands headcount into one slot per seat, carrying location and skill", () => {
    const slots = generateWeekSlots(
      [tpl({ headcount: 3, required_skill: "barista", location_id: "locX" })],
      "2026-07-13",
      TZ,
    );
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.seat)).toEqual([1, 2, 3]);
    expect(slots.every((s) => s.required_skill === "barista")).toBe(true);
    expect(slots.every((s) => s.location_id === "locX")).toBe(true);
  });

  it("preserves wall-clock time in a non-DST week (PST)", () => {
    const [slot] = generateWeekSlots([tpl()], "2026-02-02", TZ);
    expect(formatInTimeZone(slot.starts_at, TZ, "HH:mm")).toBe("09:00");
    // February is PST (UTC-8): 09:00 → 17:00 UTC.
    expect(slot.starts_at.toISOString()).toBe("2026-02-02T17:00:00.000Z");
  });
});

describe("generateWeekSlots — DST correctness", () => {
  it("handles the spring-forward week (Mar 8, 2026)", () => {
    // Week of Mon Mar 2 spans the transition on Sun Mar 8 (02:00 PST → 03:00 PDT).
    const sat = generateWeekSlots([tpl({ weekday: 6 })], "2026-03-02", TZ)[0];
    const sun = generateWeekSlots([tpl({ weekday: 0 })], "2026-03-02", TZ)[0];

    // Wall-clock 09:00 is preserved on both sides of the change.
    expect(formatInTimeZone(sat.starts_at, TZ, "HH:mm")).toBe("09:00");
    expect(formatInTimeZone(sun.starts_at, TZ, "HH:mm")).toBe("09:00");

    // Sat is PST (UTC-8) → 17:00Z; Sun is PDT (UTC-7) → 16:00Z.
    expect(sat.starts_at.toISOString()).toBe("2026-03-07T17:00:00.000Z");
    expect(sun.starts_at.toISOString()).toBe("2026-03-08T16:00:00.000Z");

    // Same wall-clock, 24 calendar hours apart, is only 23 real hours (spring forward).
    const hours = (sun.starts_at.getTime() - sat.starts_at.getTime()) / 3_600_000;
    expect(hours).toBe(23);
  });

  it("handles the fall-back week (Nov 1, 2026)", () => {
    // Week of Mon Oct 26 spans the transition on Sun Nov 1 (02:00 PDT → 01:00 PST).
    const sat = generateWeekSlots([tpl({ weekday: 6 })], "2026-10-26", TZ)[0];
    const sun = generateWeekSlots([tpl({ weekday: 0 })], "2026-10-26", TZ)[0];

    expect(formatInTimeZone(sat.starts_at, TZ, "HH:mm")).toBe("09:00");
    expect(formatInTimeZone(sun.starts_at, TZ, "HH:mm")).toBe("09:00");

    // Sat is PDT (UTC-7) → 16:00Z; Sun is PST (UTC-8) → 17:00Z.
    expect(sat.starts_at.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(sun.starts_at.toISOString()).toBe("2026-11-01T17:00:00.000Z");

    // Same wall-clock, 24 calendar hours apart, is 25 real hours (fall back).
    const hours = (sun.starts_at.getTime() - sat.starts_at.getTime()) / 3_600_000;
    expect(hours).toBe(25);
  });
});
