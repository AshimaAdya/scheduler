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
  it("renders every known template on both channels with non-empty content", () => {
    for (const id of TEMPLATE_IDS) {
      for (const channel of ["email", "sms"] as const) {
        const { subject, text } = renderTemplate(id, channel, CTX);
        expect(subject.length, `${id}/${channel}`).toBeGreaterThan(0);
        expect(text.length, `${id}/${channel}`).toBeGreaterThan(0);
      }
    }
  });

  it("puts real shift details into the copy", () => {
    const { text } = renderTemplate("coverage_ask_other_location", "email", CTX);
    expect(text).toContain("Thu Mar 5");
    expect(text).toContain("Gastown");
    expect(text).toContain("barista");
  });

  it("tells people how to reply in the SMS cover asks", () => {
    for (const id of ["coverage_ask", "coverage_ask_day_off", "coverage_ask_other_location"]) {
      const { text } = renderTemplate(id, "sms", CTX);
      expect(text, id).toContain("Reply YES");
    }
  });

  it("lists asked/declined/no-response in the escalation message", () => {
    const { text } = renderTemplate("coverage_escalated", "email", CTX);
    expect(text).toContain("Noah Williams"); // declined
    expect(text).toContain("Maya Johnson"); // no response
  });

  it("degrades gracefully when shift details are missing", () => {
    const { text } = renderTemplate("coverage_confirmed", "email", {
      recipientName: "Sam",
      fromName: "X",
    });
    expect(text).toContain("an upcoming shift");
  });

  it("falls back to a generic message for an unknown template", () => {
    const { subject, text } = renderTemplate("something_new", "email", CTX);
    expect(subject.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });
});
