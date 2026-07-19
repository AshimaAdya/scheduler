/**
 * Twilio inbound SMS handling (SCH-27).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * A texted YES claims the shift (SCH-22 atomic claim); a YES on an already-covered
 * request replies "already covered"; two open offers get a numbered
 * disambiguation and "YES 2" resolves the right one; an unknown number gets a safe
 * generic reply that is logged.
 *
 * Noah (006, cashier, available weekends) is the responder on CASHIER shifts —
 * deliberately: no other db-test file broadcasts cashier, so `listOpenOffers`
 * (correctly global) only ever sees this file's offers for him. Liam (004) is the
 * out reporter. Week 2027-03-01.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { transition } from "@/lib/coverage/transition";
import { handleInboundSms } from "@/lib/notifications/inbound";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2027-03-01";
const LIAM = "20000000-0000-0000-0000-000000000004"; //  reporter
const NOAH = "20000000-0000-0000-0000-000000000006"; //  responder (cashier)
const SOFIA = "20000000-0000-0000-0000-000000000005"; // stand-in coverer
const NOAH_PHONE = "+16045550106";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let scheduleId: string;
const createdShiftIds: string[] = [];

/** A sick-call broadcast on a new cashier shift, with a pending offer for Noah. */
async function makeOffer(startIso: string, endIso: string): Promise<string> {
  const { data: shift } = await admin
    .from("shifts")
    .insert({
      schedule_id: scheduleId,
      location_id: GASTOWN,
      starts_at: startIso,
      ends_at: endIso,
      required_skill: "cashier",
    })
    .select("id")
    .single();
  createdShiftIds.push(shift!.id);
  await admin.from("shift_assignments").insert({ shift_id: shift!.id, employee_id: LIAM });

  const { data: req } = await admin
    .from("coverage_requests")
    .insert({
      shift_id: shift!.id,
      requested_by: LIAM,
      trigger_type: "sick_call",
      status: "open",
      tier1_wait_minutes: 30,
      tier2_wait_minutes: 30,
    })
    .select("id")
    .single();
  await transition(admin, {
    requestId: req!.id,
    to: "tier1_broadcast",
    patch: { tier_expires_at: new Date(Date.now() + 30 * 60_000).toISOString() },
  });
  await admin
    .from("coverage_offers")
    .insert({ coverage_request_id: req!.id, employee_id: NOAH, tier: 1, response: "pending" });
  return req!.id;
}

async function statusOf(id: string): Promise<{ status: string; covered_by: string | null }> {
  const { data } = await admin
    .from("coverage_requests")
    .select("status, covered_by")
    .eq("id", id)
    .single();
  return data!;
}

beforeAll(async () => {
  const { data: schedule } = await admin
    .from("schedules")
    .insert({ location_id: GASTOWN, week_start: WEEK, status: "published" })
    .select("id")
    .single();
  scheduleId = schedule!.id;
});

afterEach(async () => {
  if (createdShiftIds.length) {
    await admin.from("coverage_requests").delete().in("shift_id", createdShiftIds);
    await admin.from("shift_assignments").delete().in("shift_id", createdShiftIds);
    await admin.from("shifts").delete().in("id", createdShiftIds);
    createdShiftIds.length = 0;
  }
  await admin.from("notifications_log").delete().eq("template", "sms_inbound");
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("id", scheduleId);
});

describe("handleInboundSms", () => {
  it("claims the shift on YES", async () => {
    const id = await makeOffer("2027-03-06T17:00:00Z", "2027-03-06T21:00:00Z");
    const { reply } = await handleInboundSms(admin, { fromPhone: NOAH_PHONE, body: "YES" });
    expect(reply).toMatch(/covering/i);

    const req = await statusOf(id);
    expect(req.status).toBe("covered");
    expect(req.covered_by).toBe(NOAH);
  });

  it("replies 'already covered' for a YES on a covered request", async () => {
    const id = await makeOffer("2027-03-06T17:00:00Z", "2027-03-06T21:00:00Z");
    // Someone else covers it (offer left pending on purpose).
    await transition(admin, { requestId: id, to: "covered", patch: { covered_by: SOFIA } });

    const { reply } = await handleInboundSms(admin, { fromPhone: NOAH_PHONE, body: "YES" });
    expect(reply).toMatch(/covered/i);
    expect((await statusOf(id)).covered_by).toBe(SOFIA); // unchanged
  });

  it("disambiguates two offers, and a numbered YES resolves the right one", async () => {
    await makeOffer("2027-03-06T17:00:00Z", "2027-03-06T21:00:00Z"); // #1 (Sat)
    const wed = await makeOffer("2027-03-07T17:00:00Z", "2027-03-07T21:00:00Z"); // #2 (Sun)

    const first = await handleInboundSms(admin, { fromPhone: NOAH_PHONE, body: "YES" });
    expect(first.reply).toMatch(/1:/);
    expect(first.reply).toMatch(/2:/);

    const second = await handleInboundSms(admin, { fromPhone: NOAH_PHONE, body: "YES 2" });
    expect(second.reply).toMatch(/covering/i);
    const req = await statusOf(wed);
    expect(req).toMatchObject({ status: "covered", covered_by: NOAH });
  });

  it("gives an unknown number a safe reply and logs it", async () => {
    const { reply } = await handleInboundSms(admin, {
      fromPhone: "+19998887777",
      body: "YES",
    });
    expect(reply).toMatch(/don't recognize/i);

    const { data } = await admin
      .from("notifications_log")
      .select("recipient_employee_id, payload")
      .eq("template", "sms_inbound")
      .limit(1)
      .single();
    expect(data!.recipient_employee_id).toBeNull();
    expect((data!.payload as { action: string }).action).toBe("unknown_number");
  });
});
