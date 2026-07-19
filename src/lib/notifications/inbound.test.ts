import { describe, it, expect } from "vitest";
import { parseSmsReply } from "./inbound";

describe("parseSmsReply", () => {
  it("parses a plain YES / NO (case-insensitive, punctuation-tolerant)", () => {
    expect(parseSmsReply("YES")).toEqual({ kind: "yes", index: undefined });
    expect(parseSmsReply("yes please!")).toEqual({ kind: "yes", index: undefined });
    expect(parseSmsReply(" y ")).toEqual({ kind: "yes", index: undefined });
    expect(parseSmsReply("No.")).toEqual({ kind: "no", index: undefined });
    expect(parseSmsReply("n")).toEqual({ kind: "no", index: undefined });
  });

  it("parses a numbered choice", () => {
    expect(parseSmsReply("YES 2")).toEqual({ kind: "yes", index: 2 });
    expect(parseSmsReply("yes, 1")).toEqual({ kind: "yes", index: 1 });
    expect(parseSmsReply("2")).toEqual({ kind: "yes", index: 2 }); // bare number picks
  });

  it("treats contradictory or unrecognized text as unknown", () => {
    expect(parseSmsReply("yes no")).toEqual({ kind: "unknown" });
    expect(parseSmsReply("maybe later")).toEqual({ kind: "unknown" });
    expect(parseSmsReply("")).toEqual({ kind: "unknown" });
  });
});
