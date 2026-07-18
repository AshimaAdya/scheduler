/**
 * Atomic coverage claim (SCH-22) — invariant #2.
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * The required AC: two simultaneous accepts against REAL Postgres resolve to
 * exactly one winner, one polite loser, and a consistent final state (the winner
 * holds the shift, the request is covered, the loser's offer is expired).
 *
 * Ethan (00a, Kitsilano) reports out; Aiden (008) and Maya (00b) are the two
 * Kitsilano baristas both available Tue 12:00–15:00 local per seed, so they are
 * the racing candidates with no extra availability setup.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { transition } from "@/lib/coverage/transition";
import { acceptCoverageOffer, declineCoverageOffer } from "@/lib/coverage/respond";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const KITS = "10000000-0000-0000-0000-000000000002";
const WEEK = "2026-12-07"; // distinct week for this db-test file
const ETHAN = "20000000-0000-0000-0000-00000000000a"; // reporter
const AIDEN = "20000000-0000-0000-0000-000000000008"; // candidate
const MAYA = "20000000-0000-0000-0000-00000000000b"; //  candidate

// Tue 2026-12-08, 12:00–15:00 local (PST, UTC-8 → 20:00Z).
const S_START = "2026-12-08T20:00:00Z";
const S_END = "2026-12-08T23:00:00Z";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let shiftId: string;

async function assigneeOf(id: string): Promise<string | null> {
  const { data } = await admin
    .from("shift_assignments")
    .select("employee_id")
    .eq("shift_id", id)
    .maybeSingle();
  return data?.employee_id ?? null;
}

/** Create an active broadcast with pending offers for both candidates. */
async function setupRequest(trigger: "sick_call" | "day_off"): Promise<string> {
  const { data: req } = await admin
    .from("coverage_requests")
    .insert({
      shift_id: shiftId,
      requested_by: ETHAN,
      trigger_type: trigger,
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
  await admin.from("coverage_offers").insert([
    { coverage_request_id: req!.id, employee_id: AIDEN, tier: 1, response: "pending" },
    { coverage_request_id: req!.id, employee_id: MAYA, tier: 1, response: "pending" },
  ]);
  return req!.id;
}

beforeAll(async () => {
  const { data: schedule } = await admin
    .from("schedules")
    .insert({ location_id: KITS, week_start: WEEK, status: "published" })
    .select("id")
    .single();
  const { data: shift } = await admin
    .from("shifts")
    .insert({
      schedule_id: schedule!.id,
      location_id: KITS,
      starts_at: S_START,
      ends_at: S_END,
      required_skill: "barista",
    })
    .select("id")
    .single();
  shiftId = shift!.id;
  await admin.from("shift_assignments").insert({ shift_id: shiftId, employee_id: ETHAN });
});

afterEach(async () => {
  await admin.from("coverage_requests").delete().eq("shift_id", shiftId);
  await admin
    .from("shift_assignments")
    .update({ employee_id: ETHAN, assigned_via: "generator", pending_approval: false })
    .eq("shift_id", shiftId);
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("location_id", KITS).eq("week_start", WEEK);
  await admin
    .from("notifications_log")
    .delete()
    .in("template", [
      "coverage_you_are_covering",
      "coverage_confirmed",
      "coverage_already_covered",
      "coverage_resolved",
    ]);
});

describe("acceptCoverageOffer", () => {
  it("covers the request, hands the shift to the winner, updates offers", async () => {
    const id = await setupRequest("sick_call");
    const res = await acceptCoverageOffer(admin, { requestId: id, actorEmployeeId: AIDEN });
    expect(res.ok).toBe(true);

    const { data: req } = await admin
      .from("coverage_requests")
      .select("status, covered_by")
      .eq("id", id)
      .single();
    expect(req!.status).toBe("covered");
    expect(req!.covered_by).toBe(AIDEN);
    expect(await assigneeOf(shiftId)).toBe(AIDEN); // winner's assignment

    const { data: offers } = await admin
      .from("coverage_offers")
      .select("employee_id, response")
      .eq("coverage_request_id", id);
    const byEmp = new Map((offers ?? []).map((o) => [o.employee_id, o.response]));
    expect(byEmp.get(AIDEN)).toBe("accepted");
    expect(byEmp.get(MAYA)).toBe("expired");
  });

  it("resolves two simultaneous accepts to exactly one winner", async () => {
    const id = await setupRequest("sick_call");

    const [a, b] = await Promise.all([
      acceptCoverageOffer(admin, { requestId: id, actorEmployeeId: AIDEN }),
      acceptCoverageOffer(admin, { requestId: id, actorEmployeeId: MAYA }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1); // one winner, one loser

    const { data: req } = await admin
      .from("coverage_requests")
      .select("status, covered_by")
      .eq("id", id)
      .single();
    expect(req!.status).toBe("covered");
    expect([AIDEN, MAYA]).toContain(req!.covered_by);
    // The shift is held by whoever won — consistent final state, no double swap.
    expect(await assigneeOf(shiftId)).toBe(req!.covered_by);
  });

  it("also covers a day-off request and creates the winner's assignment", async () => {
    const id = await setupRequest("day_off");
    const res = await acceptCoverageOffer(admin, { requestId: id, actorEmployeeId: MAYA });
    expect(res.ok).toBe(true);

    const { data: req } = await admin
      .from("coverage_requests")
      .select("status, covered_by")
      .eq("id", id)
      .single();
    expect(req!.status).toBe("covered");
    expect(req!.covered_by).toBe(MAYA);
    expect(await assigneeOf(shiftId)).toBe(MAYA);
  });

  it("lets a candidate decline without resolving the request", async () => {
    const id = await setupRequest("sick_call");
    const declined = await declineCoverageOffer(admin, { requestId: id, actorEmployeeId: MAYA });
    expect(declined.ok).toBe(true);

    const { data: req } = await admin
      .from("coverage_requests")
      .select("status")
      .eq("id", id)
      .single();
    expect(req!.status).toBe("tier1_broadcast"); // still open for others

    // Aiden can still take it.
    const res = await acceptCoverageOffer(admin, { requestId: id, actorEmployeeId: AIDEN });
    expect(res.ok).toBe(true);
    expect(await assigneeOf(shiftId)).toBe(AIDEN);
  });
});
