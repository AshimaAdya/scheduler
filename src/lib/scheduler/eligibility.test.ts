import { describe, it, expect } from "vitest";
import {
  conflictsWith,
  durationHours,
  hasSkill,
  isAvailableForSlot,
  overlaps,
} from "./eligibility";
import type { SchedulerSlot } from "./types";

const iv = (start: string, end: string) => ({
  startsAt: new Date(start),
  endsAt: new Date(end),
});

const slot = (over: Partial<SchedulerSlot> = {}): SchedulerSlot => ({
  id: "s1",
  requiredSkill: "cashier",
  startsAt: new Date("2026-07-13T16:00:00Z"),
  endsAt: new Date("2026-07-14T00:00:00Z"),
  localWeekday: 1,
  localStart: "09:00",
  localEnd: "17:00",
  localDate: "2026-07-13",
  ...over,
});

describe("durationHours / hasSkill", () => {
  it("computes duration in hours", () => {
    expect(durationHours(new Date("2026-07-13T09:00:00Z"), new Date("2026-07-13T17:00:00Z"))).toBe(8);
  });
  it("matches skills", () => {
    expect(hasSkill(["barista", "cashier"], "cashier")).toBe(true);
    expect(hasSkill(["barista"], "supervisor")).toBe(false);
  });
});

describe("isAvailableForSlot", () => {
  const recurring = [{ weekday: 1, start: "08:00", end: "18:00" }];

  it("is available when a recurring rule fully covers the slot", () => {
    expect(
      isAvailableForSlot({ recurring, exceptions: [] }, slot()),
    ).toBe(true);
  });

  it("is unavailable when the recurring window doesn't cover the whole slot", () => {
    expect(
      isAvailableForSlot(
        { recurring: [{ weekday: 1, start: "10:00", end: "17:00" }], exceptions: [] },
        slot({ localStart: "09:00", localEnd: "17:00" }),
      ),
    ).toBe(false);
  });

  it("is unavailable on the wrong weekday", () => {
    expect(
      isAvailableForSlot({ recurring, exceptions: [] }, slot({ localWeekday: 2 })),
    ).toBe(false);
  });

  it("a blackout exception overrides recurring availability", () => {
    expect(
      isAvailableForSlot(
        { recurring, exceptions: [{ date: "2026-07-13", isAvailable: false }] },
        slot(),
      ),
    ).toBe(false);
  });

  it("a positive exception grants availability for that date", () => {
    expect(
      isAvailableForSlot(
        { recurring: [], exceptions: [{ date: "2026-07-13", isAvailable: true }] },
        slot(),
      ),
    ).toBe(true);
  });
});

describe("overlaps / conflictsWith", () => {
  it("detects overlap", () => {
    expect(overlaps(iv("2026-07-13T09:00Z", "2026-07-13T17:00Z"), iv("2026-07-13T16:00Z", "2026-07-13T20:00Z"))).toBe(true);
    expect(overlaps(iv("2026-07-13T09:00Z", "2026-07-13T12:00Z"), iv("2026-07-13T12:00Z", "2026-07-13T15:00Z"))).toBe(false);
  });

  it("flags a rest-period violation (gap under 10h)", () => {
    // Ends 22:00, next starts 06:00 next day = 8h gap → conflict.
    const shift = iv("2026-07-14T06:00Z", "2026-07-14T10:00Z");
    const prior = iv("2026-07-13T14:00Z", "2026-07-13T22:00Z");
    expect(conflictsWith(shift, prior)).toBe(true);
  });

  it("allows a gap of at least 10h", () => {
    const shift = iv("2026-07-14T08:00Z", "2026-07-14T12:00Z");
    const prior = iv("2026-07-13T14:00Z", "2026-07-13T22:00Z"); // 10h gap
    expect(conflictsWith(shift, prior)).toBe(false);
  });
});
