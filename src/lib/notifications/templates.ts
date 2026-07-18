import { APP_NAME } from "@/lib/strings";
import type { NotificationChannel } from "./types";
import type { RenderedMessage } from "./channels/types";

/**
 * Context a template renders from: the recipient's name, the sender name, and
 * (when relevant) shift details resolved by enrich.ts plus fields passed straight
 * through from the message payload (names lists, counts, etc.).
 */
export type TemplateContext = {
  recipientName: string;
  fromName: string;
  shiftWhen?: string; // e.g. "Thu Mar 5 · 09:00–13:00"
  shiftWhere?: string | null;
  skill?: string;
  requesterName?: string;
  candidates?: number;
  asked?: string[];
  declined?: string[];
  noResponse?: string[];
};

function shiftPhrase(ctx: TemplateContext): string {
  if (!ctx.shiftWhen) return "an upcoming shift";
  const skill = ctx.skill ? `${ctx.skill} ` : "";
  const where = ctx.shiftWhere ? ` at ${ctx.shiftWhere}` : "";
  return `the ${skill}shift on ${ctx.shiftWhen}${where}`;
}

function nameList(names: string[] | undefined): string {
  return names && names.length > 0 ? names.join(", ") : "no one";
}

type Rendered = { subject: string; text: string };
type Renderer = (ctx: TemplateContext) => Rendered;

/** Email rendering (subject + body), keyed by the template ids the flows emit. */
const TEMPLATES: Record<string, Renderer> = {
  coverage_started: (ctx) => ({
    subject: "Looking for cover",
    text: `Hi ${ctx.recipientName}, we're finding cover for ${shiftPhrase(ctx)}. ${
      ctx.candidates ?? 0
    } ${ctx.candidates === 1 ? "person" : "people"} asked so far.`,
  }),
  coverage_ask: (ctx) => ({
    subject: "Can you cover a shift?",
    text: `Hi ${ctx.recipientName}, ${shiftPhrase(ctx)} needs cover. Open ${APP_NAME} to pick it up.`,
  }),
  coverage_ask_day_off: (ctx) => ({
    subject: "Can you cover a shift?",
    text: `Hi ${ctx.recipientName}, ${shiftPhrase(ctx)} needs cover. Open ${APP_NAME} to pick it up.`,
  }),
  coverage_ask_other_location: (ctx) => ({
    subject: "Can you cover a shift?",
    text: `Hi ${ctx.recipientName}, ${shiftPhrase(ctx)} needs cover. Open ${APP_NAME} to pick it up.`,
  }),
  coverage_you_are_covering: (ctx) => ({
    subject: "You're covering a shift",
    text: `Thanks ${ctx.recipientName} — you're now covering ${shiftPhrase(ctx)}.`,
  }),
  coverage_confirmed: (ctx) => ({
    subject: "Your shift is covered",
    text: `Good news ${ctx.recipientName} — ${shiftPhrase(ctx)} is now covered.`,
  }),
  coverage_already_covered: (ctx) => ({
    subject: "That shift's already covered",
    text: `Thanks for offering, ${ctx.recipientName} — ${shiftPhrase(ctx)} was already covered by someone else.`,
  }),
  coverage_escalated: (ctx) => ({
    subject: "A shift still needs cover",
    text: `${shiftPhrase(ctx)} still needs cover and has come to you.
Asked: ${nameList(ctx.asked)}.
Declined: ${nameList(ctx.declined)}.
No response: ${nameList(ctx.noResponse)}.`,
  }),
  coverage_resolved: (ctx) => ({
    subject: "Cover sorted",
    text: `Heads up ${ctx.recipientName} — ${shiftPhrase(ctx)} is now covered.`,
  }),
  coverage_swap_proposed: (ctx) => ({
    subject: `${ctx.requesterName ?? "A coworker"} wants to swap a shift`,
    text: `${ctx.requesterName ?? "A coworker"} proposed a shift swap with you. Open ${APP_NAME} to accept or decline.`,
  }),
  coverage_swap_accepted: (ctx) => ({
    subject: "Your swap was accepted",
    text: `Good news ${ctx.recipientName} — your shift swap was accepted.`,
  }),
  coverage_swap_declined: (ctx) => ({
    subject: "Your swap was declined",
    text: `Your shift swap was declined, ${ctx.recipientName}. You can try someone else or ask the team to cover.`,
  }),
  coverage_swap_pending_approval: () => ({
    subject: "A swap needs your OK",
    text: `A shift swap is waiting for your confirmation in ${APP_NAME}.`,
  }),
  schedule_published: (ctx) => ({
    subject: "Your schedule is ready",
    text: `Hi ${ctx.recipientName}, your schedule is published. Open ${APP_NAME} to see your shifts.`,
  }),
};

/**
 * SMS-specific bodies where they differ from email — the cover asks tell people
 * how to reply (inbound handling lands in SCH-27). Anything not listed reuses the
 * email body text.
 */
const SMS_TEXT: Record<string, (ctx: TemplateContext) => string> = {
  coverage_ask: (ctx) => `${shiftPhrase(ctx)} needs cover. Reply YES to take it, NO to pass.`,
  coverage_ask_day_off: (ctx) =>
    `${shiftPhrase(ctx)} needs cover. Reply YES to take it, NO to pass.`,
  coverage_ask_other_location: (ctx) =>
    `${shiftPhrase(ctx)} needs cover. Reply YES to take it, NO to pass.`,
};

/** All known template ids (used by the dev preview + drift test). */
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

const fallback: Renderer = (ctx) => ({
  subject: `${ctx.fromName}: an update`,
  text: `Hi ${ctx.recipientName}, you have an update in ${APP_NAME}.`,
});

/** Render a template for a channel. Unknown ids fall back to a safe generic. */
export function renderTemplate(
  template: string,
  channel: NotificationChannel,
  ctx: TemplateContext,
): RenderedMessage {
  const base = (TEMPLATES[template] ?? fallback)(ctx);
  if (channel === "sms") {
    return { subject: base.subject, text: SMS_TEXT[template]?.(ctx) ?? base.text };
  }
  return { subject: base.subject, text: base.text };
}
