import { describe, it, expect } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  assertLegalTransition,
  IllegalTransitionError,
  isLegalTransition,
  isTerminal,
  type CoverageStatus,
} from "./state-machine";

const ALL: CoverageStatus[] = [
  "open",
  "tier1_broadcast",
  "tier2_broadcast",
  "escalated",
  "covered",
  "cancelled",
  "manager_resolved",
];

describe("coverage state machine", () => {
  it("accepts every declared legal transition", () => {
    for (const from of ALL) {
      for (const to of ALLOWED_TRANSITIONS[from]) {
        expect(isLegalTransition(from, to)).toBe(true);
        expect(() => assertLegalTransition(from, to)).not.toThrow();
      }
    }
  });

  it("throws IllegalTransitionError on every transition not declared legal", () => {
    for (const from of ALL) {
      for (const to of ALL) {
        if (ALLOWED_TRANSITIONS[from].includes(to)) continue;
        expect(isLegalTransition(from, to)).toBe(false);
        expect(() => assertLegalTransition(from, to)).toThrow(IllegalTransitionError);
      }
    }
  });

  it("supports the full linear path open → … → covered", () => {
    const path: CoverageStatus[] = [
      "open",
      "tier1_broadcast",
      "tier2_broadcast",
      "escalated",
      "covered",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(isLegalTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it("terminal states have no outgoing transitions", () => {
    for (const t of ["covered", "cancelled", "manager_resolved"] as CoverageStatus[]) {
      expect(isTerminal(t)).toBe(true);
      expect(ALLOWED_TRANSITIONS[t]).toEqual([]);
    }
  });

  it("rejects skipping tiers and backward/self moves", () => {
    expect(isLegalTransition("open", "escalated")).toBe(false);
    expect(isLegalTransition("tier2_broadcast", "tier1_broadcast")).toBe(false);
    expect(isLegalTransition("covered", "open")).toBe(false);
    expect(isLegalTransition("open", "open")).toBe(false);
  });

  it("allows manager cancel/resolve and accept from any active tier", () => {
    for (const active of ["open", "tier1_broadcast", "tier2_broadcast", "escalated"] as CoverageStatus[]) {
      expect(isLegalTransition(active, "cancelled")).toBe(true);
      expect(isLegalTransition(active, "manager_resolved")).toBe(true);
      expect(isLegalTransition(active, "covered")).toBe(true);
    }
  });
});
