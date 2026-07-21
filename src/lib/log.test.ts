import { describe, it, expect } from "vitest";
import { logEvent, setLogSink } from "./log";

describe("logEvent", () => {
  it("emits one JSON line with the event and fields (incl. request id)", () => {
    const lines: string[] = [];
    const restore = setLogSink((l) => lines.push(l));
    try {
      logEvent("coverage.transition", { coverageRequestId: "req-1", from: "open", to: "covered" });
    } finally {
      restore();
    }

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toMatchObject({
      event: "coverage.transition",
      coverageRequestId: "req-1",
      from: "open",
      to: "covered",
    });
    expect(parsed.ts).toBeTruthy();
  });
});
