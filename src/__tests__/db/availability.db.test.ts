/**
 * Availability round-trip + RLS write-isolation tests (SCH-10).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves:
 *  - Recurring times round-trip unchanged (stored as naive wall-clock `time`, so
 *    they don't shift with any viewer's timezone — the AC's "across timezones").
 *  - RLS: an employee cannot write another employee's availability (read
 *    isolation is already covered by rls.db.test.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEmployeeAvailability } from "@/lib/availability/queries";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Use an employee no other db test creates an auth user for, to avoid
// cross-file collisions (rls uses Liam/Marcus, auth-invite Emma/Priya, recovery Olivia).
const ACTOR_ID = "20000000-0000-0000-0000-000000000006"; // Noah
const OTHER_ID = "20000000-0000-0000-0000-000000000005"; // Sofia
const ACTOR_EMAIL = "noah@harbourcoffee.test";
const PASSWORD = "availability-test-123!";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let employeeClient: SupabaseClient;
let actorUserId: string;
const createdRuleIds: string[] = [];

beforeAll(async () => {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === ACTOR_EMAIL);
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const { data, error } = await admin.auth.admin.createUser({
    email: ACTOR_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user");
  actorUserId = data.user.id;
  await admin.from("employees").update({ user_id: actorUserId }).eq("id", ACTOR_ID);

  employeeClient = createClient(API_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await employeeClient.auth.signInWithPassword({
    email: ACTOR_EMAIL,
    password: PASSWORD,
  });
  if (signInErr) throw signInErr;
});

afterAll(async () => {
  if (createdRuleIds.length > 0) {
    await admin.from("availability_rules").delete().in("id", createdRuleIds);
  }
  await admin.from("employees").update({ user_id: null }).eq("id", ACTOR_ID);
  if (actorUserId) await admin.auth.admin.deleteUser(actorUserId);
});

describe("availability round-trip", () => {
  it("stores and reads back a recurring range unchanged", async () => {
    const { data, error } = await admin
      .from("availability_rules")
      .insert({
        employee_id: ACTOR_ID,
        kind: "recurring",
        weekday: 3,
        start_time: "08:30",
        end_time: "12:45",
        is_available: true,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    createdRuleIds.push(data!.id);

    const availability = await getEmployeeAvailability(admin, ACTOR_ID);
    const match = availability.recurring.find(
      (r) => r.weekday === 3 && r.start === "08:30",
    );
    expect(match).toBeDefined();
    expect(match?.end).toBe("12:45");
  });
});

describe("availability RLS (writes)", () => {
  it("employee CANNOT write another employee's availability", async () => {
    const { error } = await employeeClient.from("availability_rules").insert({
      employee_id: OTHER_ID,
      kind: "recurring",
      weekday: 1,
      start_time: "09:00",
      end_time: "17:00",
      is_available: true,
    });
    expect(error).not.toBeNull();
  });

  it("employee CAN write their own availability", async () => {
    const { data, error } = await employeeClient
      .from("availability_rules")
      .insert({
        employee_id: ACTOR_ID,
        kind: "exception",
        exception_date: "2026-08-01",
        is_available: false,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    if (data) createdRuleIds.push(data.id);
  });
});
