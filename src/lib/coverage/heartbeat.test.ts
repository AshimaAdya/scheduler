import { describe, it, expect } from "vitest";
import { isStale } from "./heartbeat";

const NOW = new Date("2027-01-01T10:00:00Z");

describe("isStale (cron dead-man switch)", () => {
  it("is stale when there's never been a run", () => {
    expect(isStale(null, 10, NOW)).toBe(true);
  });

  it("is fresh within the threshold", () => {
    expect(isStale("2027-01-01T09:55:00Z", 10, NOW)).toBe(false); // 5 min ago
    expect(isStale("2027-01-01T09:51:00Z", 10, NOW)).toBe(false); // 9 min ago
  });

  it("is stale once the threshold is exceeded", () => {
    expect(isStale("2027-01-01T09:45:00Z", 10, NOW)).toBe(true); // 15 min ago
  });
});
