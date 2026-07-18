import { describe, it, expect } from "vitest";
import { renderTemplate, TEMPLATE_IDS, type TemplateContext } from "./templates";

const CTX: TemplateContext = {
  recipientName: "Sofia",
  fromName: "Harbour Coffee Co.",
  shiftWhen: "Thu Mar 5 · 09:00–13:00",
  shiftWhere: "Gastown",
  skill: "barista",
  requesterName: "Liam",
  candidates: 3,
  asked: ["Sofia Martins", "Aiden Kaur"],
  declined: ["Noah Williams"],
  noResponse: ["Maya Johnson"],
};

describe("renderTemplate", () => {
  it("renders every known template with a non-empty subject + text", () => {
    for (const id of TEMPLATE_IDS) {
      const { subject, text } = renderTemplate(id, CTX);
      expect(subject.length, id).toBeGreaterThan(0);
      expect(text.length, id).toBeGreaterThan(0);
    }
  });

  it("puts real shift details into the copy", () => {
    const { text } = renderTemplate("coverage_ask_other_location", CTX);
    expect(text).toContain("Thu Mar 5");
    expect(text).toContain("Gastown");
    expect(text).toContain("barista");
  });

  it("lists asked/declined/no-response in the escalation message", () => {
    const { text } = renderTemplate("coverage_escalated", CTX);
    expect(text).toContain("Noah Williams"); // declined
    expect(text).toContain("Maya Johnson"); // no response
  });

  it("degrades gracefully when shift details are missing", () => {
    const { text } = renderTemplate("coverage_confirmed", {
      recipientName: "Sam",
      fromName: "X",
    });
    expect(text).toContain("an upcoming shift");
  });

  it("falls back to a generic message for an unknown template", () => {
    const { subject, text } = renderTemplate("something_new", CTX);
    expect(subject.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });
});
