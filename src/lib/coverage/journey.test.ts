import { describe, it, expect } from "vitest";
import { journeyStep } from "./journey";
import { firstName } from "@/lib/name";

describe("journeyStep", () => {
  it("maps active statuses to the three-step journey", () => {
    expect(journeyStep("open")).toEqual({ step: 1, complete: false });
    expect(journeyStep("tier1_broadcast")).toEqual({ step: 1, complete: false });
    expect(journeyStep("tier2_broadcast")).toEqual({ step: 2, complete: false });
    expect(journeyStep("escalated")).toEqual({ step: 3, complete: false });
  });

  it("marks covered as complete and terminal-without-journey as null", () => {
    expect(journeyStep("covered")).toEqual({ step: 3, complete: true });
    expect(journeyStep("cancelled")).toBeNull();
    expect(journeyStep("manager_resolved")).toBeNull();
    expect(journeyStep("whatever")).toBeNull();
  });
});

describe("firstName (privacy: no full-name lists)", () => {
  it("returns the first token", () => {
    expect(firstName("Sofia Martins")).toBe("Sofia");
    expect(firstName("Liam")).toBe("Liam");
    expect(firstName("  Aiden  Kaur ")).toBe("Aiden");
  });

  it("degrades safely for empty input", () => {
    expect(firstName(null)).toBe("A coworker");
    expect(firstName("")).toBe("A coworker");
  });
});
