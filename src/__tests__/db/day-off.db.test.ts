/**
 * Planned day-off flow test (SCH-20).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves: day-off uses the longer wait-windows; the DB CHECK makes approving a
 * day off impossible before coverage (even a direct service-role write fails —
 * invariant #1); and approveDayOff only succeeds once the request is covered.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { requestDayOff, approveDayOff } from "@/lib/coverage/day-off";
import { transition } from "@/lib/coverage/transition";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2026-10-05"; // distinct week for this db-test file
const LIAM = "20000000-0000-0000-0000-000000000004"; // reporter
const SOFIA = "20000000-0000-0000-0000-000000000005"; // stand-in coverer

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let shiftId: string;

async function newDayOffRequest(): Promise<string> {
  const res = await requestDayOff(admin, {
    shiftId,
    reporterEmployeeId: LIAM,
  });
  if (!res.ok) throw new Error(res.error);
  return res.requestId;
}

beforeAll(async () => {
  const { data: schedule } = await admin
    .from("schedules")
    .insert({ location_id: GASTOWN, week_start: WEEK, status: "published" })
    .select("id")
    .single();
  const { data: shift } = await admin
    .from("shifts")
    .insert({
      schedule_id: schedule!.id,
      location_id: GASTOWN,
      starts_at: "2026-10-08T17:00:00Z",
      ends_at: "2026-10-08T21:00:00Z",
      required_skill: "barista",
    })
    .select("id")
    .single();
  shiftId = shift!.id;
  await admin.from("shift_assignments").insert({ shift_id: shiftId, employee_id: LIAM });
});

afterEach(async () => {
  await admin.from("coverage_requests").delete().eq("shift_id", shiftId);
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("location_id", GASTOWN).eq("week_start", WEEK);
  await admin
    .from("notifications_log")
    .delete()
    .in("template", ["coverage_ask_day_off", "coverage_started"]);
});

describe("requestDayOff", () => {
  it("creates a day_off request with the longer wait-windows", async () => {
    const requestId = await newDayOffRequest();
    const { data: req } = await admin
      .from("coverage_requests")
      .select("trigger_type, status, tier1_wait_minutes, time_off_approved_at")
      .eq("id", requestId)
      .single();
    expect(req!.trigger_type).toBe("day_off");
    expect(req!.status).toBe("tier1_broadcast");
    expect(req!.tier1_wait_minutes).toBe(1440); // seeded day_off window (24h), not 30
    expect(req!.time_off_approved_at).toBeNull(); // pending — finding coverage
  });
});

describe("invariant #1 — approval gated on coverage", () => {
  it("rejects a direct service-role approval while uncovered (DB CHECK)", async () => {
    const requestId = await newDayOffRequest();
    // Bypass the app entirely and try to approve via a raw update.
    const { error } = await admin
      .from("coverage_requests")
      .update({ time_off_approved_at: new Date().toISOString() })
      .eq("id", requestId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/time_off_approved_requires_coverage/);
  });

  it("approveDayOff refuses until the request is covered, then succeeds", async () => {
    const requestId = await newDayOffRequest();

    const early = await approveDayOff(admin, { requestId });
    expect(early.ok).toBe(false);

    // Confirm coverage (what SCH-22's atomic claim will do).
    await transition(admin, {
      requestId,
      to: "covered",
      patch: { covered_by: SOFIA },
    });

    const approved = await approveDayOff(admin, { requestId });
    expect(approved.ok).toBe(true);

    const { data: req } = await admin
      .from("coverage_requests")
      .select("time_off_approved_at")
      .eq("id", requestId)
      .single();
    expect(req!.time_off_approved_at).not.toBeNull();
  });
});
