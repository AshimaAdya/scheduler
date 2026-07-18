import { describe, it, expect } from "vitest";
import { nextTierAction, type TierRequest } from "./escalation";

const at = (iso: string) => new Date(iso);

function req(overrides: Partial<TierRequest>): TierRequest {
  return {
    status: "tier1_broadcast",
    tier_expires_at: "2027-01-04T10:00:00Z",
    tier2_wait_minutes: 30,
    ...overrides,
  };
}

describe("nextTierAction (fake clock)", () => {
  it("does nothing before the window expires", () => {
    const action = nextTierAction(req({}), at("2027-01-04T09:59:59Z"));
    expect(action).toEqual({ kind: "none" });
  });

  it("advances tier1 → tier2 once expired, re-arming with tier2 window", () => {
    const now = at("2027-01-04T10:00:00Z");
    const action = nextTierAction(req({ tier2_wait_minutes: 30 }), now);
    expect(action).toEqual({
      kind: "advance_to_tier2",
      newExpiresAt: "2027-01-04T10:30:00.000Z",
    });
  });

  it("escalates tier2 once its window expires", () => {
    const action = nextTierAction(
      req({ status: "tier2_broadcast" }),
      at("2027-01-04T10:00:01Z"),
    );
    expect(action).toEqual({ kind: "escalate" });
  });

  it("treats a null expiry and terminal/other states as no-op", () => {
    expect(nextTierAction(req({ tier_expires_at: null }), at("2027-01-04T11:00:00Z"))).toEqual({
      kind: "none",
    });
    expect(nextTierAction(req({ status: "escalated" }), at("2027-01-04T11:00:00Z"))).toEqual({
      kind: "none",
    });
    expect(nextTierAction(req({ status: "covered" }), at("2027-01-04T11:00:00Z"))).toEqual({
      kind: "none",
    });
  });
});
