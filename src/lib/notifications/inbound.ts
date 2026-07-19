import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { resolveSettings } from "@/lib/settings/resolve";
import { strings } from "@/lib/strings";
import { acceptCoverageOffer, declineCoverageOffer } from "@/lib/coverage/respond";

/**
 * Inbound SMS handling (SCH-27): match the sender to an employee and their open
 * cover offers, parse a strict YES/NO (+ optional number to disambiguate), and
 * resolve via the SCH-22 atomic claim. No free-text/LLM parsing — keywords only.
 * Every inbound is logged to notifications_log for manager visibility.
 */

const OFFERABLE = ["open", "tier1_broadcast", "tier2_broadcast", "escalated", "covered"];

export type ParsedReply = { kind: "yes" | "no" | "unknown"; index?: number };

/** Strict YES/NO parse; tolerant of case, punctuation, and a trailing number. */
export function parseSmsReply(body: string): ParsedReply {
  const tokens = body
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const hasYes = tokens.includes("yes") || tokens.includes("y");
  const hasNo = tokens.includes("no") || tokens.includes("n");
  const numToken = tokens.find((t) => /^\d+$/.test(t));
  const index = numToken ? Number(numToken) : undefined;

  if (hasYes && hasNo) return { kind: "unknown" };
  if (hasYes) return { kind: "yes", index };
  if (hasNo) return { kind: "no", index };
  if (index !== undefined) return { kind: "yes", index }; // bare number picks from the list
  return { kind: "unknown" };
}

type OpenOffer = { requestId: string; startsAt: string; label: string };

type ShiftEmbed = {
  starts_at: string;
  ends_at: string;
  required_skill: string;
  locations: { name: string } | { name: string }[] | null;
};

async function listOpenOffers(
  supabase: SupabaseClient,
  employeeId: string,
  timezone: string,
): Promise<OpenOffer[]> {
  const { data: offers } = await supabase
    .from("coverage_offers")
    .select("coverage_request_id")
    .eq("employee_id", employeeId)
    .eq("response", "pending");
  const requestIds = [...new Set((offers ?? []).map((o) => o.coverage_request_id))];
  if (requestIds.length === 0) return [];

  const { data: requests } = await supabase
    .from("coverage_requests")
    .select(
      "id, status, shifts:shift_id(starts_at, ends_at, required_skill, locations:location_id(name))",
    )
    .in("id", requestIds)
    .in("status", OFFERABLE);

  const out: OpenOffer[] = [];
  for (const r of requests ?? []) {
    const rel = r.shifts as ShiftEmbed | ShiftEmbed[] | null;
    const shift = Array.isArray(rel) ? rel[0] : rel;
    if (!shift) continue;
    const loc = shift.locations;
    const where = Array.isArray(loc) ? (loc[0]?.name ?? null) : (loc?.name ?? null);
    out.push({
      requestId: r.id,
      startsAt: shift.starts_at,
      label: `${formatInTimeZone(new Date(shift.starts_at), timezone, "EEE MMM d · HH:mm")} · ${shift.required_skill}${where ? ` at ${where}` : ""}`,
    });
  }
  return out.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

async function logInbound(
  supabase: SupabaseClient,
  employeeId: string | null,
  fromPhone: string,
  body: string,
  action: string,
): Promise<void> {
  await supabase.from("notifications_log").insert({
    recipient_employee_id: employeeId,
    channel: "sms",
    template: "sms_inbound",
    status: "delivered",
    provider: "twilio",
    payload: { from: fromPhone, body, action },
  });
}

function disambiguation(offers: OpenOffer[]): string {
  const lines = offers.map((o, i) => `${i + 1}: ${o.label}`);
  return `${strings.smsReplies.disambIntro}\n${lines.join("\n")}`;
}

/**
 * Resolve one inbound text. Returns the reply body to send back as TwiML. Runs
 * service-role (the caller has already verified the Twilio signature).
 */
export async function handleInboundSms(
  supabase: SupabaseClient,
  params: { fromPhone: string; body: string },
): Promise<{ reply: string }> {
  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const timezone = resolveSettings(business?.settings).timezone;

  const { data: emp } = await supabase
    .from("employees")
    .select("id")
    .eq("phone", params.fromPhone)
    .maybeSingle();

  if (!emp) {
    await logInbound(supabase, null, params.fromPhone, params.body, "unknown_number");
    return { reply: strings.smsReplies.unknownNumber };
  }

  const parsed = parseSmsReply(params.body);
  const offers = await listOpenOffers(supabase, emp.id, timezone);

  if (offers.length === 0) {
    await logInbound(supabase, emp.id, params.fromPhone, params.body, "no_offers");
    return { reply: strings.smsReplies.noOffers };
  }

  // NO with several offers and no number → pass on all of them.
  if (parsed.kind === "no" && offers.length > 1 && !parsed.index) {
    for (const o of offers) {
      await declineCoverageOffer(supabase, { requestId: o.requestId, actorEmployeeId: emp.id });
    }
    await logInbound(supabase, emp.id, params.fromPhone, params.body, "declined_all");
    return { reply: strings.smsReplies.declined };
  }

  // Pick the target offer: the only one, or the numbered one.
  let target: OpenOffer | undefined;
  if (offers.length === 1) target = offers[0];
  else if (parsed.index && parsed.index >= 1 && parsed.index <= offers.length) {
    target = offers[parsed.index - 1];
  }

  if (!target || parsed.kind === "unknown") {
    // Ambiguous, or unparseable — ask again (numbered if there are several).
    const reply =
      offers.length > 1 ? disambiguation(offers) : strings.smsReplies.askYesNo;
    await logInbound(supabase, emp.id, params.fromPhone, params.body, "needs_clarification");
    return { reply };
  }

  if (parsed.kind === "yes") {
    const res = await acceptCoverageOffer(supabase, {
      requestId: target.requestId,
      actorEmployeeId: emp.id,
    });
    await logInbound(
      supabase,
      emp.id,
      params.fromPhone,
      params.body,
      res.ok ? "accepted" : "accept_failed",
    );
    return { reply: res.ok ? strings.smsReplies.covering(target.label) : (res.error ?? strings.smsReplies.alreadyCovered) };
  }

  // NO on a specific offer.
  await declineCoverageOffer(supabase, { requestId: target.requestId, actorEmployeeId: emp.id });
  await logInbound(supabase, emp.id, params.fromPhone, params.body, "declined");
  return { reply: strings.smsReplies.declined };
}
