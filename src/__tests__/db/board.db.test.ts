/**
 * Manager live-ops board loaders (SCH-29).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * getUnfilledThisWeek lists published, unassigned shifts in the next 7 days;
 * getOfferBreakdown reports who was asked / declined / still deciding. Shifts are
 * dated ~2 days out (real time) so only this file's shifts fall in the window —
 * every other db-test file uses far-future dates.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getOfferBreakdown, getUnfilledThisWeek } from "@/lib/coverage/board";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2027-05-03";
const LIAM = "20000000-0000-0000-0000-000000000004";
const SOFIA = "20000000-0000-0000-0000-000000000005";
const AIDEN = "20000000-0000-0000-0000-000000000008";
const MAYA = "20000000-0000-0000-0000-00000000000b";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let scheduleId: string;
const shiftIds: string[] = [];
const requestIds: string[] = [];
const daysOut = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();

async function newShift(startIso: string): Promise<string> {
  const { data } = await admin
    .from("shifts")
    .insert({
      schedule_id: scheduleId,
      location_id: GASTOWN,
      starts_at: startIso,
      ends_at: new Date(new Date(startIso).getTime() + 4 * 3600_000).toISOString(),
      required_skill: "barista",
    })
    .select("id")
    .single();
  shiftIds.push(data!.id);
  return data!.id;
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
  if (requestIds.length) {
    await admin.from("coverage_requests").delete().in("id", requestIds);
    requestIds.length = 0;
  }
  if (shiftIds.length) {
    await admin.from("shift_assignments").delete().in("shift_id", shiftIds);
    await admin.from("shifts").delete().in("id", shiftIds);
    shiftIds.length = 0;
  }
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("id", scheduleId);
});

describe("getUnfilledThisWeek", () => {
  it("lists unassigned upcoming shifts and skips filled ones", async () => {
    const unfilled = await newShift(daysOut(2));
    const filled = await newShift(daysOut(3));
    await admin.from("shift_assignments").insert({ shift_id: filled, employee_id: LIAM });

    const list = await getUnfilledThisWeek(admin, "America/Vancouver");
    const ids = list.map((s) => s.id);
    expect(ids).toContain(unfilled);
    expect(ids).not.toContain(filled);
  });
});

describe("getOfferBreakdown", () => {
  it("reports asked / declined / waiting by first name", async () => {
    const shift = await newShift(daysOut(2));
    const { data: req } = await admin
      .from("coverage_requests")
      .insert({ shift_id: shift, requested_by: LIAM, trigger_type: "sick_call", status: "open" })
      .select("id")
      .single();
    requestIds.push(req!.id);

    await admin.from("coverage_offers").insert([
      { coverage_request_id: req!.id, employee_id: SOFIA, tier: 1, response: "declined" },
      { coverage_request_id: req!.id, employee_id: AIDEN, tier: 1, response: "pending" },
      { coverage_request_id: req!.id, employee_id: MAYA, tier: 1, response: "pending" },
    ]);

    const map = await getOfferBreakdown(admin, [req!.id]);
    const b = map.get(req!.id)!;
    expect(b.asked).toBe(3);
    expect(b.declined).toEqual(["Sofia"]);
    expect(b.waiting.sort()).toEqual(["Aiden", "Maya"]);
  });
});
