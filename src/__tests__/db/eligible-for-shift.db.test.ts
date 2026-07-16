/**
 * Live shift-eligibility test (SCH-15).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves the calendar's reassign list only offers eligible employees: skill
 * match + availability are enforced (the AC "ineligible never offered"), and a
 * reassignment persists.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { eligibleEmployeesForShift } from "@/lib/schedule/eligible";
import { reassignShift } from "@/lib/schedule/service";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2026-08-10"; // Monday
const ETHAN = "20000000-0000-0000-0000-00000000000a"; // barista, Tue 06:00–14:00
const OLIVIA = "20000000-0000-0000-0000-000000000009"; // cashier only
const EMMA = "20000000-0000-0000-0000-000000000007"; // barista, Tue 05:00–13:00 (ends too early)

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let shiftId: string;

beforeAll(async () => {
  const { data: schedule } = await admin
    .from("schedules")
    .insert({ location_id: GASTOWN, week_start: WEEK, status: "draft" })
    .select("id")
    .single();

  // Barista shift, Tue 2026-08-11 06:00–14:00 America/Vancouver (PDT = UTC-7).
  const { data: shift } = await admin
    .from("shifts")
    .insert({
      schedule_id: schedule!.id,
      location_id: GASTOWN,
      starts_at: "2026-08-11T13:00:00Z",
      ends_at: "2026-08-11T21:00:00Z",
      required_skill: "barista",
    })
    .select("id")
    .single();
  shiftId = shift!.id;
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("location_id", GASTOWN).eq("week_start", WEEK);
});

describe("eligibleEmployeesForShift", () => {
  it("offers only skill-matched, available employees", async () => {
    const eligible = await eligibleEmployeesForShift(admin, shiftId);
    const ids = eligible.map((e) => e.id);

    expect(ids).toContain(ETHAN); // barista, available Tue 06–14
    expect(ids).not.toContain(OLIVIA); // cashier only → skill mismatch
    expect(ids).not.toContain(EMMA); // barista but only free 05–13 → doesn't cover 06–14
  });

  it("persists a reassignment and still offers the assignee", async () => {
    const res = await reassignShift(admin, { shiftId, employeeId: ETHAN });
    expect(res.ok).toBe(true);

    const { data: assignment } = await admin
      .from("shift_assignments")
      .select("employee_id")
      .eq("shift_id", shiftId)
      .single();
    expect(assignment!.employee_id).toBe(ETHAN);

    // Ethan is excluded from his own hours/intervals, so he remains eligible.
    const eligible = await eligibleEmployeesForShift(admin, shiftId);
    expect(eligible.map((e) => e.id)).toContain(ETHAN);
  });
});
