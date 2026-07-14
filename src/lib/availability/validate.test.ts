import { describe, it, expect } from "vitest";
import { validateWeeklyAvailability, type TimeRange } from "./validate";

const r = (weekday: number, start: string, end: string): TimeRange => ({
  weekday,
  start,
  end,
});

describe("validateWeeklyAvailability", () => {
  it("accepts non-overlapping ranges, including touching endpoints", () => {
    const result = validateWeeklyAvailability([
      r(1, "09:00", "12:00"),
      r(1, "12:00", "15:00"), // touches, does not overlap
      r(2, "09:00", "17:00"),
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects overlapping ranges on the same weekday", () => {
    const result = validateWeeklyAvailability([
      r(1, "09:00", "13:00"),
      r(1, "12:00", "15:00"),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.index === 1)).toBe(true);
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("allows the same clock range on different weekdays", () => {
    const result = validateWeeklyAvailability([
      r(1, "09:00", "17:00"),
      r(2, "09:00", "17:00"),
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects end before or equal to start", () => {
    expect(validateWeeklyAvailability([r(1, "17:00", "09:00")]).ok).toBe(false);
    expect(validateWeeklyAvailability([r(1, "09:00", "09:00")]).ok).toBe(false);
  });

  it("rejects malformed times", () => {
    expect(validateWeeklyAvailability([r(1, "9am", "5pm")]).ok).toBe(false);
    expect(validateWeeklyAvailability([r(1, "25:00", "26:00")]).ok).toBe(false);
  });

  it("accepts an empty set (fully unavailable)", () => {
    expect(validateWeeklyAvailability([]).ok).toBe(true);
  });
});
