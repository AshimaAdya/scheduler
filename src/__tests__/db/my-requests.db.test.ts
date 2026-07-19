/**
 * "My requests" loader (SCH-28).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * getMyRequests returns only the caller's own coverage requests with their live
 * status and the coverer's first name (privacy). Emma (007) is the reporter — no
 * other db-test file creates coverage requests for her. Week 2027-04-05.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { transition } from "@/lib/coverage/transition";
import { getMyRequests } from "@/lib/coverage/my-requests";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2027-04-05";
const EMMA = "20000000-0000-0000-0000-000000000007"; // reporter (own requests)
const SOFIA = "20000000-0000-0000-0000-000000000005"; // coverer

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let scheduleId: string;
const shiftIds: string[] = [];

async function newShift(startIso: string): Promise<string> {
  const { data } = await admin
    .from("shifts")
    .insert({
      schedule_id: scheduleId,
      location_id: GASTOWN,
      starts_at: startIso,
      ends_at: startIso.replace("T17", "T21"),
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
  if (shiftIds.length) {
    await admin.from("coverage_requests").delete().in("shift_id", shiftIds);
    await admin.from("shifts").delete().in("id", shiftIds);
    shiftIds.length = 0;
  }
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("id", scheduleId);
});

describe("getMyRequests", () => {
  it("returns the caller's requests with status and coverer first name", async () => {
    const shiftA = await newShift("2027-04-06T17:00:00Z");
    const shiftB = await newShift("2027-04-07T17:00:00Z");

    // A day-off still searching for cover.
    const { data: dayOff } = await admin
      .from("coverage_requests")
      .insert({ shift_id: shiftA, requested_by: EMMA, trigger_type: "day_off", status: "open" })
      .select("id")
      .single();
    await transition(admin, { requestId: dayOff!.id, to: "tier1_broadcast" });

    // A sick day already covered by Sofia.
    const { data: sick } = await admin
      .from("coverage_requests")
      .insert({ shift_id: shiftB, requested_by: EMMA, trigger_type: "sick_call", status: "open" })
      .select("id")
      .single();
    await transition(admin, { requestId: sick!.id, to: "covered", patch: { covered_by: SOFIA } });

    const requests = await getMyRequests(admin, EMMA);

    const dayOffRow = requests.find((r) => r.id === dayOff!.id);
    expect(dayOffRow).toMatchObject({
      trigger: "day_off",
      status: "tier1_broadcast",
      coveredByFirstName: null,
    });
    expect(dayOffRow!.when).toContain("Apr");

    const sickRow = requests.find((r) => r.id === sick!.id);
    expect(sickRow).toMatchObject({
      trigger: "sick_call",
      status: "covered",
      coveredByFirstName: "Sofia", // first name only
    });
  });

  it("does not return another employee's requests", async () => {
    const shiftA = await newShift("2027-04-06T17:00:00Z");
    await admin
      .from("coverage_requests")
      .insert({ shift_id: shiftA, requested_by: SOFIA, trigger_type: "day_off", status: "open" });

    const requests = await getMyRequests(admin, EMMA);
    expect(requests.every((r) => r.trigger !== undefined)).toBe(true);
    expect(requests.length).toBe(0); // none belong to Emma
  });
});
