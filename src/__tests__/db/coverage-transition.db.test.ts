/**
 * Coverage state-machine transition() test (SCH-18).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves every legal transition updates status + writes an audit row, illegal
 * transitions throw, and concurrent transitions can't both apply (compare-and-swap).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { transition } from "@/lib/coverage/transition";
import { IllegalTransitionError } from "@/lib/coverage/state-machine";
import { TransitionConflictError } from "@/lib/coverage/transition";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2026-09-07"; // distinct week for this db-test file
const LIAM = "20000000-0000-0000-0000-000000000004";
const SOFIA = "20000000-0000-0000-0000-000000000005";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let shiftId: string;

async function createOpenRequest(): Promise<string> {
  const { data } = await admin
    .from("coverage_requests")
    .insert({
      shift_id: shiftId,
      requested_by: LIAM,
      trigger_type: "sick_call",
      status: "open",
    })
    .select("id")
    .single();
  return data!.id;
}

async function auditCount(requestId: string): Promise<number> {
  const { count } = await admin
    .from("coverage_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("coverage_request_id", requestId);
  return count ?? 0;
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
      starts_at: "2026-09-08T16:00:00Z",
      ends_at: "2026-09-09T00:00:00Z",
      required_skill: "barista",
    })
    .select("id")
    .single();
  shiftId = shift!.id;
});

afterEach(async () => {
  await admin.from("coverage_requests").delete().eq("shift_id", shiftId);
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("location_id", GASTOWN).eq("week_start", WEEK);
});

describe("transition()", () => {
  it("walks the full path, writing an audit row per step", async () => {
    const id = await createOpenRequest();

    await transition(admin, { requestId: id, to: "tier1_broadcast" });
    await transition(admin, { requestId: id, to: "tier2_broadcast" });
    await transition(admin, { requestId: id, to: "escalated" });
    await transition(admin, {
      requestId: id,
      to: "covered",
      patch: { covered_by: SOFIA },
    });

    const { data: req } = await admin
      .from("coverage_requests")
      .select("status, covered_by, covered_at")
      .eq("id", id)
      .single();
    expect(req!.status).toBe("covered");
    expect(req!.covered_by).toBe(SOFIA);
    expect(req!.covered_at).not.toBeNull();

    expect(await auditCount(id)).toBe(4);

    const { data: firstAudit } = await admin
      .from("coverage_audit_log")
      .select("from_status, to_status")
      .eq("coverage_request_id", id)
      .order("created_at")
      .limit(1)
      .single();
    expect(firstAudit).toEqual({ from_status: "open", to_status: "tier1_broadcast" });
  });

  it("throws on an illegal transition and writes no audit row", async () => {
    const id = await createOpenRequest();
    await expect(
      transition(admin, { requestId: id, to: "escalated" }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(await auditCount(id)).toBe(0);
  });

  it("lets only one of two concurrent transitions win (compare-and-swap)", async () => {
    const id = await createOpenRequest();
    const results = await Promise.allSettled([
      transition(admin, { requestId: id, to: "tier1_broadcast" }),
      transition(admin, { requestId: id, to: "tier1_broadcast" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      TransitionConflictError,
    );

    // Exactly one audit row for the single successful transition.
    expect(await auditCount(id)).toBe(1);
  });
});
