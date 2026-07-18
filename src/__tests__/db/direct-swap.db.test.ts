/**
 * Direct swap (SCH-21) test.
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves: a proposal stores a two_way direct_swap; the accepted swap moves BOTH
 * assignments atomically and covers the request; two concurrent accepts resolve
 * to exactly one winner; eligibility is re-validated at accept time; and a
 * decline can be retried or converted into a day-off broadcast.
 *
 * Aiden (008) and Maya (00b) are used by no other db-test file. Both are baristas
 * and both are available Tue/Thu 12:00–16:00 local (America/Vancouver) per seed,
 * so the shifts below need no extra availability setup.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  proposeSwap,
  acceptSwap,
  declineSwap,
  convertSwapToBroadcast,
  confirmSwap,
  swapCandidates,
  tradeableShifts,
} from "@/lib/coverage/swap";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2026-11-02"; // distinct week for this db-test file
const AIDEN = "20000000-0000-0000-0000-000000000008"; // A — requester
const MAYA = "20000000-0000-0000-0000-00000000000b"; //  B — target

// Tue 2026-11-03 and Thu 2026-11-05, both 12:00–16:00 local (PST, UTC-8 → 20:00Z).
const A_START = "2026-11-03T20:00:00Z";
const A_END = "2026-11-04T00:00:00Z";
const B_START = "2026-11-05T20:00:00Z";
const B_END = "2026-11-06T00:00:00Z";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let shiftA: string; // assigned to Aiden
let shiftB: string; // assigned to Maya

async function assigneeOf(shiftId: string): Promise<string | null> {
  const { data } = await admin
    .from("shift_assignments")
    .select("employee_id")
    .eq("shift_id", shiftId)
    .maybeSingle();
  return data?.employee_id ?? null;
}

async function propose(): Promise<string> {
  const res = await proposeSwap(admin, {
    aEmployeeId: AIDEN,
    aShiftId: shiftA,
    targetEmployeeId: MAYA,
    offeredShiftId: shiftB,
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
  const base = { schedule_id: schedule!.id, location_id: GASTOWN, required_skill: "barista" };
  const { data: a } = await admin
    .from("shifts")
    .insert({ ...base, starts_at: A_START, ends_at: A_END })
    .select("id")
    .single();
  const { data: b } = await admin
    .from("shifts")
    .insert({ ...base, starts_at: B_START, ends_at: B_END })
    .select("id")
    .single();
  shiftA = a!.id;
  shiftB = b!.id;
  await admin.from("shift_assignments").insert([
    { shift_id: shiftA, employee_id: AIDEN },
    { shift_id: shiftB, employee_id: MAYA },
  ]);
});

afterEach(async () => {
  await admin.from("coverage_requests").delete().in("shift_id", [shiftA, shiftB]);
  // Undo any swap and clear pending flags so each test starts clean.
  await admin
    .from("shift_assignments")
    .update({ employee_id: AIDEN, assigned_via: "generator", pending_approval: false })
    .eq("shift_id", shiftA);
  await admin
    .from("shift_assignments")
    .update({ employee_id: MAYA, assigned_via: "generator", pending_approval: false })
    .eq("shift_id", shiftB);
  // Remove any re-validation exceptions a test added.
  await admin
    .from("availability_rules")
    .delete()
    .eq("kind", "exception")
    .in("employee_id", [AIDEN, MAYA])
    .in("exception_date", ["2026-11-03", "2026-11-05"]);
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("location_id", GASTOWN).eq("week_start", WEEK);
  await admin
    .from("notifications_log")
    .delete()
    .in("template", [
      "coverage_swap_proposed",
      "coverage_swap_accepted",
      "coverage_swap_declined",
      "coverage_swap_pending_approval",
      "coverage_ask_day_off",
      "coverage_started",
    ]);
});

describe("proposeSwap + disclosure", () => {
  it("stores a two_way direct_swap with target + offered shift", async () => {
    const id = await propose();
    const { data: req } = await admin
      .from("coverage_requests")
      .select("trigger_type, trade_type, status, target_employee_id, offered_shift_id")
      .eq("id", id)
      .single();
    expect(req).toMatchObject({
      trigger_type: "direct_swap",
      trade_type: "two_way",
      status: "open",
      target_employee_id: MAYA,
      offered_shift_id: shiftB,
    });
  });

  it("lists eligible coworkers (incl. B) but never A", async () => {
    const candidates = await swapCandidates(admin, { shiftId: shiftA, aEmployeeId: AIDEN });
    const ids = candidates.map((c) => c.id);
    expect(ids).toContain(MAYA);
    expect(ids).not.toContain(AIDEN);
  });

  it("offers only B's shifts that A can actually take", async () => {
    const shifts = await tradeableShifts(admin, {
      aEmployeeId: AIDEN,
      aShiftId: shiftA,
      targetEmployeeId: MAYA,
    });
    expect(shifts.map((s) => s.id)).toEqual([shiftB]);
  });
});

describe("acceptSwap", () => {
  it("swaps both assignments atomically and covers the request", async () => {
    const id = await propose();
    const res = await acceptSwap(admin, { requestId: id, actorEmployeeId: MAYA });
    expect(res.ok).toBe(true); // pending mirrors approval_mode (shared setting)

    const { data: req } = await admin
      .from("coverage_requests")
      .select("status, covered_by, covered_at")
      .eq("id", id)
      .single();
    expect(req!.status).toBe("covered");
    expect(req!.covered_by).toBe(MAYA);
    expect(req!.covered_at).not.toBeNull();

    // Both assignments changed hands.
    expect(await assigneeOf(shiftA)).toBe(MAYA);
    expect(await assigneeOf(shiftB)).toBe(AIDEN);

    // A covered transition wrote exactly one audit row.
    const { count } = await admin
      .from("coverage_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("coverage_request_id", id)
      .eq("to_status", "covered");
    expect(count).toBe(1);
  });

  it("lets only one of two concurrent accepts win", async () => {
    const id = await propose();
    const results = await Promise.all([
      acceptSwap(admin, { requestId: id, actorEmployeeId: MAYA }),
      acceptSwap(admin, { requestId: id, actorEmployeeId: MAYA }),
    ]);
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(1);

    // Exactly one clean swap — not a double swap back to the start.
    expect(await assigneeOf(shiftA)).toBe(MAYA);
    expect(await assigneeOf(shiftB)).toBe(AIDEN);
  });

  it("re-validates eligibility at accept time (availability changed)", async () => {
    const id = await propose();
    // A becomes unavailable for B's shift AFTER proposing.
    await admin.from("availability_rules").insert({
      employee_id: AIDEN,
      kind: "exception",
      exception_date: "2026-11-05",
      is_available: false,
    });

    const res = await acceptSwap(admin, { requestId: id, actorEmployeeId: MAYA });
    expect(res.ok).toBe(false);

    // Nothing moved; request still open.
    expect(await assigneeOf(shiftA)).toBe(AIDEN);
    expect(await assigneeOf(shiftB)).toBe(MAYA);
    const { data: req } = await admin
      .from("coverage_requests")
      .select("status")
      .eq("id", id)
      .single();
    expect(req!.status).toBe("open");
  });

  it("manager confirm clears pending_approval on both assignments", async () => {
    const id = await propose();
    await acceptSwap(admin, { requestId: id, actorEmployeeId: MAYA });
    // Force the require_approval outcome deterministically (the shared approval
    // setting races across parallel test files), then prove confirm clears it.
    await admin
      .from("shift_assignments")
      .update({ pending_approval: true })
      .in("shift_id", [shiftA, shiftB]);

    const confirmed = await confirmSwap(admin, { requestId: id });
    expect(confirmed.ok).toBe(true);

    const { data: assignments } = await admin
      .from("shift_assignments")
      .select("pending_approval")
      .in("shift_id", [shiftA, shiftB]);
    expect((assignments ?? []).every((a) => a.pending_approval === false)).toBe(true);
  });
});

describe("declineSwap → retry / broadcast", () => {
  it("cancels on decline and can be re-proposed (retry)", async () => {
    const first = await propose();
    const declined = await declineSwap(admin, { requestId: first, actorEmployeeId: MAYA });
    expect(declined.ok).toBe(true);

    const { data: cancelled } = await admin
      .from("coverage_requests")
      .select("status")
      .eq("id", first)
      .single();
    expect(cancelled!.status).toBe("cancelled");

    // Shift is free again, so A can propose a fresh swap.
    const second = await propose();
    expect(second).not.toBe(first);
  });

  it("converts a declined swap into a day-off broadcast", async () => {
    const id = await propose();
    await declineSwap(admin, { requestId: id, actorEmployeeId: MAYA });

    const res = await convertSwapToBroadcast(admin, {
      requestId: id,
      actorEmployeeId: AIDEN,
    });
    expect(res.ok).toBe(true);

    const { data: broadcast } = await admin
      .from("coverage_requests")
      .select("trigger_type, status")
      .eq("shift_id", shiftA)
      .neq("id", id)
      .single();
    expect(broadcast).toMatchObject({ trigger_type: "day_off", status: "tier1_broadcast" });
  });
});
