/**
 * Manager override controls (SCH-24).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves the four overrides work on an active request, each writes an audit row
 * with actor + action + timestamp, direct-assign validates eligibility (with an
 * explicit override path that is logged), and a manager can still intervene from
 * the escalated state (never locked out).
 *
 * Reporter Liam (004); Aiden (008) is an eligible barista; Noah (006, no barista)
 * is only assignable via the eligibility override. Manager actor = Marcus (002).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { transition } from "@/lib/coverage/transition";
import {
  managerAssign,
  cancelRequest,
  forceApproveUncovered,
  resolveManually,
} from "@/lib/coverage/overrides";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2027-02-01"; // distinct week for this db-test file
const LIAM = "20000000-0000-0000-0000-000000000004"; //  reporter
const NOAH = "20000000-0000-0000-0000-000000000006"; //  not a barista (override-only)
const AIDEN = "20000000-0000-0000-0000-000000000008"; // eligible barista
const MARCUS = "20000000-0000-0000-0000-000000000002"; // manager (actor)

// Mon 2027-02-01, 13:00–16:00 local (PST → 21:00Z). Aiden is available Mon 08–17.
const S_START = "2027-02-01T21:00:00Z";
const S_END = "2027-02-02T00:00:00Z";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let shiftId: string;
const future = () => new Date(Date.now() + 30 * 60_000).toISOString();

async function newRequest(): Promise<string> {
  const { data: req } = await admin
    .from("coverage_requests")
    .insert({
      shift_id: shiftId,
      requested_by: LIAM,
      trigger_type: "sick_call",
      status: "open",
      tier1_wait_minutes: 30,
      tier2_wait_minutes: 30,
    })
    .select("id")
    .single();
  await transition(admin, {
    requestId: req!.id,
    to: "tier1_broadcast",
    patch: { tier_expires_at: future() },
  });
  return req!.id;
}

async function statusOf(id: string): Promise<string> {
  const { data } = await admin.from("coverage_requests").select("status").eq("id", id).single();
  return data!.status;
}

async function assigneeOf(id: string): Promise<string | null> {
  const { data } = await admin
    .from("shift_assignments")
    .select("employee_id")
    .eq("shift_id", id)
    .maybeSingle();
  return data?.employee_id ?? null;
}

async function lastAudit(id: string) {
  const { data } = await admin
    .from("coverage_audit_log")
    .select("to_status, actor_employee_id, detail, created_at")
    .eq("coverage_request_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data!;
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
      starts_at: S_START,
      ends_at: S_END,
      required_skill: "barista",
    })
    .select("id")
    .single();
  shiftId = shift!.id;
  await admin.from("shift_assignments").insert({ shift_id: shiftId, employee_id: LIAM });
});

afterEach(async () => {
  await admin.from("coverage_requests").delete().eq("shift_id", shiftId);
  // Reset the shift back to the reporter (assign/force-uncovered mutate it).
  await admin.from("shift_assignments").delete().eq("shift_id", shiftId);
  await admin.from("shift_assignments").insert({ shift_id: shiftId, employee_id: LIAM });
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("location_id", GASTOWN).eq("week_start", WEEK);
  await admin
    .from("notifications_log")
    .delete()
    .in("template", [
      "coverage_you_are_covering",
      "coverage_confirmed",
      "coverage_cancelled",
      "coverage_absence_approved",
      "coverage_resolved_manually",
    ]);
});

describe("managerAssign (direct assign)", () => {
  it("covers the request with an eligible employee and audits actor + action", async () => {
    const id = await newRequest();
    const res = await managerAssign(admin, {
      requestId: id,
      assigneeId: AIDEN,
      actorId: MARCUS,
      overrideEligibility: false,
    });
    expect(res.ok).toBe(true);

    expect(await statusOf(id)).toBe("covered");
    expect(await assigneeOf(shiftId)).toBe(AIDEN);

    const audit = await lastAudit(id);
    expect(audit.to_status).toBe("covered");
    expect(audit.actor_employee_id).toBe(MARCUS);
    expect(audit.detail).toMatchObject({ action: "manager_assign", overrideEligibility: false });
    expect(audit.created_at).toBeTruthy();
  });

  it("blocks an ineligible assignee unless eligibility is overridden (logged)", async () => {
    const id = await newRequest();

    const blocked = await managerAssign(admin, {
      requestId: id,
      assigneeId: NOAH, // no barista skill
      actorId: MARCUS,
      overrideEligibility: false,
    });
    expect(blocked.ok).toBe(false);
    expect(await statusOf(id)).toBe("tier1_broadcast"); // untouched

    const forced = await managerAssign(admin, {
      requestId: id,
      assigneeId: NOAH,
      actorId: MARCUS,
      overrideEligibility: true,
    });
    expect(forced.ok).toBe(true);
    expect(await statusOf(id)).toBe("covered");
    expect(await assigneeOf(shiftId)).toBe(NOAH);

    const audit = await lastAudit(id);
    expect(audit.detail).toMatchObject({ action: "manager_assign", overrideEligibility: true });
  });
});

describe("cancel / resolve / force-uncovered", () => {
  it("cancels the request, leaving the reporter on the shift", async () => {
    const id = await newRequest();
    const res = await cancelRequest(admin, { requestId: id, actorId: MARCUS });
    expect(res.ok).toBe(true);
    expect(await statusOf(id)).toBe("cancelled");
    expect(await assigneeOf(shiftId)).toBe(LIAM);

    const audit = await lastAudit(id);
    expect(audit).toMatchObject({ to_status: "cancelled", actor_employee_id: MARCUS });
    expect(audit.detail).toMatchObject({ action: "cancel" });
  });

  it("force-approves uncovered — resolves and leaves the shift unfilled", async () => {
    const id = await newRequest();
    const res = await forceApproveUncovered(admin, { requestId: id, actorId: MARCUS });
    expect(res.ok).toBe(true);
    expect(await statusOf(id)).toBe("manager_resolved");
    expect(await assigneeOf(shiftId)).toBeNull(); // unfilled

    const audit = await lastAudit(id);
    expect(audit.detail).toMatchObject({ action: "force_uncovered" });
  });

  it("resolves manually, leaving assignments untouched", async () => {
    const id = await newRequest();
    const res = await resolveManually(admin, { requestId: id, actorId: MARCUS });
    expect(res.ok).toBe(true);
    expect(await statusOf(id)).toBe("manager_resolved");
    expect(await assigneeOf(shiftId)).toBe(LIAM);

    const audit = await lastAudit(id);
    expect(audit.detail).toMatchObject({ action: "resolve_manual" });
  });
});

describe("never locked out", () => {
  it("lets a manager intervene even from the escalated state", async () => {
    const id = await newRequest();
    await transition(admin, {
      requestId: id,
      to: "tier2_broadcast",
      patch: { tier_expires_at: future() },
    });
    await transition(admin, { requestId: id, to: "escalated" });

    const res = await cancelRequest(admin, { requestId: id, actorId: MARCUS });
    expect(res.ok).toBe(true);
    expect(await statusOf(id)).toBe("cancelled");
  });
});
