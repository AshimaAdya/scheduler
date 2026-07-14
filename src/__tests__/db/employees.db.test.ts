/**
 * Employee management + deactivation-exclusion tests (SCH-9).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves the "deactivated employees are excluded from scheduling and coverage
 * broadcasts" invariant via the canonical getSchedulableEmployees query, using
 * the service-role client for setup/teardown.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getSchedulableEmployees } from "@/lib/employees/queries";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Seeded inactive employee (see supabase/seed.sql).
const SAM_INACTIVE_ID = "20000000-0000-0000-0000-00000000000c";
const LIAM_ACTIVE_ID = "20000000-0000-0000-0000-000000000004";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

describe("getSchedulableEmployees", () => {
  it("excludes deactivated employees", async () => {
    const employees = await getSchedulableEmployees(admin);
    const ids = employees.map((e) => e.id);
    expect(ids).toContain(LIAM_ACTIVE_ID);
    expect(ids).not.toContain(SAM_INACTIVE_ID);
    // Seed has 12 employees, 1 inactive → 11 schedulable.
    expect(employees.length).toBe(11);
  });

  it("filters by skill and excludes inactive even if the skill matches", async () => {
    // Sam (inactive) has the "cleaner" skill; must still be excluded.
    const cleaners = await getSchedulableEmployees(admin, { skill: "cleaner" });
    const ids = cleaners.map((e) => e.id);
    expect(ids).not.toContain(SAM_INACTIVE_ID);
    expect(cleaners.every((e) => e.skills.includes("cleaner"))).toBe(true);
  });

  it("filters by home location", async () => {
    const gastown = "10000000-0000-0000-0000-000000000001";
    const list = await getSchedulableEmployees(admin, { locationId: gastown });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.home_location_id === gastown)).toBe(true);
  });
});

describe("deactivation via update", () => {
  // Reactivate anyone we deactivate so the seed stays intact for other tests.
  const toReactivate: string[] = [];
  afterEach(async () => {
    for (const id of toReactivate.splice(0)) {
      await admin.from("employees").update({ active: true }).eq("id", id);
    }
  });

  it("removes a newly-deactivated employee from the schedulable set", async () => {
    const before = await getSchedulableEmployees(admin);
    expect(before.map((e) => e.id)).toContain(LIAM_ACTIVE_ID);

    await admin.from("employees").update({ active: false }).eq("id", LIAM_ACTIVE_ID);
    toReactivate.push(LIAM_ACTIVE_ID);

    const after = await getSchedulableEmployees(admin);
    expect(after.map((e) => e.id)).not.toContain(LIAM_ACTIVE_ID);
    expect(after.length).toBe(before.length - 1);
  });
});
