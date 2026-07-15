/**
 * Row-level security tests (SCH-7).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Uses REAL JWTs — an employee client and a manager client — to prove that RLS,
 * not UI hiding, enforces domain invariant #3: an employee cannot read another
 * employee's assignments or availability, while a manager can. Also asserts RLS
 * is enabled on every table.
 *
 * Setup/teardown use the service-role client (BYPASSRLS) and are idempotent:
 * everything created here is torn down in afterAll, leaving seed data intact.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";

// Seeded employees (see supabase/seed.sql).
const LIAM_ID = "20000000-0000-0000-0000-000000000004"; // employee (actor A)
const SOFIA_ID = "20000000-0000-0000-0000-000000000005"; // employee (the "other")
const MARCUS_ID = "20000000-0000-0000-0000-000000000002"; // manager (actor M)
const LOCATION_ID = "10000000-0000-0000-0000-000000000001"; // Gastown

const PASSWORD = "test-password-123!";
const LIAM_EMAIL = "liam@harbourcoffee.test";
const MARCUS_EMAIL = "marcus@harbourcoffee.test";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let employeeClient: SupabaseClient;
let managerClient: SupabaseClient;

let liamUserId: string;
let marcusUserId: string;
let scheduleId: string;

const ALL_TABLES = [
  "businesses",
  "locations",
  "employees",
  "availability_rules",
  "shift_templates",
  "schedules",
  "shifts",
  "shift_assignments",
  "coverage_requests",
  "coverage_offers",
  "notifications_log",
];

/** Create (or fetch) an auth user and link it to the given employee row. */
async function createUserForEmployee(
  email: string,
  employeeId: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user created");
  const { error: linkErr } = await admin
    .from("employees")
    .update({ user_id: data.user.id })
    .eq("id", employeeId);
  if (linkErr) throw linkErr;
  return data.user.id;
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(API_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw error;
  return client;
}

beforeAll(async () => {
  liamUserId = await createUserForEmployee(LIAM_EMAIL, LIAM_ID);
  marcusUserId = await createUserForEmployee(MARCUS_EMAIL, MARCUS_ID);

  // A published schedule with one shift assigned to each of Liam and Sofia,
  // so both have assignment data to (attempt to) read.
  const { data: sched, error: schedErr } = await admin
    .from("schedules")
    .insert({
      location_id: LOCATION_ID,
      // Distinct week per db-test file so parallel schedule inserts don't collide
      // on the (location, week) unique constraint.
      week_start: "2026-06-01",
      status: "published",
    })
    .select("id")
    .single();
  if (schedErr) throw schedErr;
  scheduleId = sched.id;

  const { data: shifts, error: shiftErr } = await admin
    .from("shifts")
    .insert([
      {
        schedule_id: scheduleId,
        location_id: LOCATION_ID,
        starts_at: "2026-07-08T16:00:00Z",
        ends_at: "2026-07-08T22:00:00Z",
        required_skill: "barista",
      },
      {
        schedule_id: scheduleId,
        location_id: LOCATION_ID,
        starts_at: "2026-07-09T16:00:00Z",
        ends_at: "2026-07-09T22:00:00Z",
        required_skill: "barista",
      },
    ])
    .select("id");
  if (shiftErr || !shifts) throw shiftErr ?? new Error("no shifts");

  const { error: assignErr } = await admin.from("shift_assignments").insert([
    { shift_id: shifts[0].id, employee_id: LIAM_ID },
    { shift_id: shifts[1].id, employee_id: SOFIA_ID },
  ]);
  if (assignErr) throw assignErr;

  employeeClient = await signIn(LIAM_EMAIL);
  managerClient = await signIn(MARCUS_EMAIL);
});

afterAll(async () => {
  // Cascades to shifts + shift_assignments.
  if (scheduleId) await admin.from("schedules").delete().eq("id", scheduleId);
  await admin
    .from("employees")
    .update({ user_id: null })
    .in("id", [LIAM_ID, MARCUS_ID]);
  if (liamUserId) await admin.auth.admin.deleteUser(liamUserId);
  if (marcusUserId) await admin.auth.admin.deleteUser(marcusUserId);
});

describe("RLS: employee isolation (invariant #3)", () => {
  it("employee CANNOT read another employee's assignments", async () => {
    const { data } = await employeeClient
      .from("shift_assignments")
      .select("*")
      .eq("employee_id", SOFIA_ID);
    expect(data).toEqual([]);
  });

  it("employee CANNOT read another employee's availability", async () => {
    const { data } = await employeeClient
      .from("availability_rules")
      .select("*")
      .eq("employee_id", SOFIA_ID);
    expect(data).toEqual([]);
  });

  it("employee CAN read their own assignments", async () => {
    const { data } = await employeeClient
      .from("shift_assignments")
      .select("*")
      .eq("employee_id", LIAM_ID);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("employee CANNOT read another employee's row", async () => {
    const { data } = await employeeClient
      .from("employees")
      .select("*")
      .eq("id", SOFIA_ID);
    expect(data).toEqual([]);
  });
});

describe("RLS: manager access", () => {
  it("manager CAN read another employee's assignments", async () => {
    const { data } = await managerClient
      .from("shift_assignments")
      .select("*")
      .eq("employee_id", SOFIA_ID);
    expect(data?.length).toBeGreaterThan(0);
  });

  it("manager CAN read another employee's availability", async () => {
    const { data } = await managerClient
      .from("availability_rules")
      .select("*")
      .eq("employee_id", SOFIA_ID);
    expect(data?.length).toBeGreaterThan(0);
  });
});

describe("RLS: coverage", () => {
  it("RLS is enabled on every table", async () => {
    const pg = new Client({ connectionString: DB_URL });
    await pg.connect();
    try {
      const { rows } = await pg.query<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = any($1)`,
        [ALL_TABLES],
      );
      expect(rows.length).toBe(ALL_TABLES.length);
      for (const row of rows) {
        expect(row.relrowsecurity, `${row.relname} should have RLS enabled`).toBe(
          true,
        );
      }
    } finally {
      await pg.end();
    }
  });
});
