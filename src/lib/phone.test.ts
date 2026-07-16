import { describe, it, expect } from "vitest";
import { normalizeToE164 } from "./phone";

describe("normalizeToE164", () => {
  it("normalizes a 10-digit North American number to +1", () => {
    expect(normalizeToE164("604 555 1234")).toEqual({
      ok: true,
      e164: "+16045551234",
    });
    expect(normalizeToE164("(604) 555-1234")).toEqual({
      ok: true,
      e164: "+16045551234",
    });
  });

  it("handles 11-digit numbers starting with 1", () => {
    expect(normalizeToE164("1-604-555-1234")).toEqual({
      ok: true,
      e164: "+16045551234",
    });
  });

  it("keeps an already-E.164 number", () => {
    expect(normalizeToE164("+16045551234")).toEqual({
      ok: true,
      e164: "+16045551234",
    });
    expect(normalizeToE164("+44 20 7946 0958")).toEqual({
      ok: true,
      e164: "+442079460958",
    });
  });

  it("rejects empty input", () => {
    expect(normalizeToE164("  ").ok).toBe(false);
  });

  it("rejects too-short numbers", () => {
    expect(normalizeToE164("12345").ok).toBe(false);
  });

  it("returns a helpful error message on invalid input", () => {
    const result = normalizeToE164("abc");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});
