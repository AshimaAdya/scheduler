/**
 * Sick-call flow test (SCH-19).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves reporting out creates a sick_call request, snapshots the wait-windows,
 * opens tier-1 broadcast to eligible SAME-LOCATION employees (offers +
 * notifications) excluding the reporter, and refuses a duplicate search.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { reportSickCall } from "@/lib/coverage/sick-call";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2026-09-14"; // Monday, distinct for this db-test file
const LIAM = "20000000-0000-0000-0000-000000000004"; // reporter (Gastown)
const SOFIA = "20000000-0000-0000-0000-000000000005"; // eligible candidate (Gastown, barista)
const AIDEN = "20000000-0000-0000-0000-000000000008"; // Kitsilano — other location

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let shiftId: string;
let sofiaRuleId: string;

beforeAll(async () => {
  const { data: schedule } = await admin
    .from("schedules")
    .insert({ location_id: GASTOWN, week_start: WEEK, status: "published" })
    .select("id")
    .single();

  // Barista shift, Thu 2026-09-17 10:00–14:00 America/Vancouver (PDT = UTC-7).
  const { data: shift } = await admin
    .from("shifts")
    .insert({
      schedule_id: schedule!.id,
      location_id: GASTOWN,
      starts_at: "2026-09-17T17:00:00Z",
      ends_at: "2026-09-17T21:00:00Z",
      required_skill: "barista",
    })
    .select("id")
    .single();
  shiftId = shift!.id;
  await admin.from("shift_assignments").insert({ shift_id: shiftId, employee_id: LIAM });

  // Give Sofia (Gastown, barista) availability covering the shift → eligible.
  const { data: rule } = await admin
    .from("availability_rules")
    .insert({
      employee_id: SOFIA,
      kind: "recurring",
      weekday: 4, // Thursday
      start_time: "08:00",
      end_time: "16:00",
      is_available: true,
    })
    .select("id")
    .single();
  sofiaRuleId = rule!.id;
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("location_id", GASTOWN).eq("week_start", WEEK);
  if (sofiaRuleId) await admin.from("availability_rules").delete().eq("id", sofiaRuleId);
  await admin
    .from("notifications_log")
    .delete()
    .in("template", ["coverage_ask", "coverage_started"]);
});

describe("reportSickCall", () => {
  it("opens a tier-1 broadcast to eligible same-location employees", async () => {
    const res = await reportSickCall(admin, {
      shiftId,
      reporterEmployeeId: LIAM,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.offers).toBeGreaterThan(0);

    // Request: sick_call, tier1_broadcast, windows snapshotted, tier_expires_at set.
    const { data: request } = await admin
      .from("coverage_requests")
      .select("id, trigger_type, status, tier1_wait_minutes, tier_expires_at, requested_by")
      .eq("shift_id", shiftId)
      .single();
    expect(request!.trigger_type).toBe("sick_call");
    expect(request!.status).toBe("tier1_broadcast");
    expect(request!.tier1_wait_minutes).toBe(30); // seeded sick_call tier1
    expect(request!.tier_expires_at).not.toBeNull();

    // Offers: include Sofia, exclude the reporter and other-location employees.
    const { data: offers } = await admin
      .from("coverage_offers")
      .select("employee_id, tier")
      .eq("coverage_request_id", request!.id);
    const offeredIds = (offers ?? []).map((o) => o.employee_id);
    expect(offeredIds).toContain(SOFIA);
    expect(offeredIds).not.toContain(LIAM); // reporter never gets their own broadcast
    expect(offeredIds).not.toContain(AIDEN); // other location, tier 1 is same-location
    expect((offers ?? []).every((o) => o.tier === 1)).toBe(true);

    // Audit row for the transition, and notifications queued.
    const { count: audit } = await admin
      .from("coverage_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("coverage_request_id", request!.id)
      .eq("to_status", "tier1_broadcast");
    expect(audit).toBe(1);

    const { count: asks } = await admin
      .from("notifications_log")
      .select("id", { count: "exact", head: true })
      .eq("template", "coverage_ask");
    expect(asks).toBeGreaterThan(0);
  });

  it("refuses to start a second search for the same shift", async () => {
    const res = await reportSickCall(admin, {
      shiftId,
      reporterEmployeeId: LIAM,
    });
    expect(res.ok).toBe(false);
  });
});
