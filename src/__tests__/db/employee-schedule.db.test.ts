/**
 * Employee schedule view + claiming test (SCH-16).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves invariant #3 (an employee's payloads never contain another employee's
 * assignments/shifts) using a real employee JWT, and that claiming an open shift
 * works, respects approval_mode, and is atomic.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEmployeeSchedule } from "@/lib/schedule/employee-view";
import { claimShift } from "@/lib/schedule/claim";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const KITS = "10000000-0000-0000-0000-000000000002";
const WEEK = "2026-08-17"; // Monday
const AIDEN = "20000000-0000-0000-0000-000000000008"; // barista, Mon–Fri 08–17
const AIDEN_EMAIL = "aiden@harbourcoffee.test";
const MAYA = "20000000-0000-0000-0000-00000000000b"; // the "other" employee
const PASSWORD = "employee-schedule-123!";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let aidenClient: SupabaseClient;
let aidenUserId: string;
let scheduleId: string;
let ownShiftId: string;
let otherShiftId: string;
let openShiftId: string;
let originalSettings: unknown;
let businessId: string;

async function setApprovalMode(mode: "auto_publish" | "require_approval") {
  const current = (originalSettings ?? {}) as Record<string, unknown>;
  await admin
    .from("businesses")
    .update({ settings: { ...current, approval_mode: mode } })
    .eq("id", businessId);
}

async function insertOpenShift(startZ: string, endZ: string): Promise<string> {
  const { data } = await admin
    .from("shifts")
    .insert({
      schedule_id: scheduleId,
      location_id: KITS,
      starts_at: startZ,
      ends_at: endZ,
      required_skill: "barista",
    })
    .select("id")
    .single();
  return data!.id;
}

beforeAll(async () => {
  const { data: biz } = await admin
    .from("businesses")
    .select("id, settings")
    .limit(1)
    .single();
  businessId = biz!.id;
  originalSettings = biz!.settings;

  const list = await admin.auth.admin.listUsers();
  const existing = list.data.users.find((u) => u.email === AIDEN_EMAIL);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
  const { data: user } = await admin.auth.admin.createUser({
    email: AIDEN_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  aidenUserId = user!.user!.id;
  await admin.from("employees").update({ user_id: aidenUserId }).eq("id", AIDEN);

  aidenClient = createClient(API_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await aidenClient.auth.signInWithPassword({ email: AIDEN_EMAIL, password: PASSWORD });

  const { data: schedule } = await admin
    .from("schedules")
    .insert({ location_id: KITS, week_start: WEEK, status: "published" })
    .select("id")
    .single();
  scheduleId = schedule!.id;

  // Aiden's own shift (Tue 08:00–16:00 PDT).
  ownShiftId = await insertOpenShift("2026-08-18T15:00:00Z", "2026-08-18T23:00:00Z");
  await admin.from("shift_assignments").insert({ shift_id: ownShiftId, employee_id: AIDEN });

  // Another employee's shift — must never be visible to Aiden.
  otherShiftId = await insertOpenShift("2026-08-18T16:00:00Z", "2026-08-19T00:00:00Z");
  await admin.from("shift_assignments").insert({ shift_id: otherShiftId, employee_id: MAYA });

  // An open shift Aiden is eligible for (Wed 08:00–16:00 PDT).
  openShiftId = await insertOpenShift("2026-08-19T15:00:00Z", "2026-08-19T23:00:00Z");
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("id", scheduleId);
  await admin.from("employees").update({ user_id: null }).eq("id", AIDEN);
  if (aidenUserId) await admin.auth.admin.deleteUser(aidenUserId);
  await admin.from("businesses").update({ settings: originalSettings }).eq("id", businessId);
});

describe("employee schedule view — invariant #3", () => {
  it("returns own + open shifts, never another employee's", async () => {
    const view = await getEmployeeSchedule(aidenClient, AIDEN);
    const ownIds = view.own.map((s) => s.id);
    const claimableIds = view.claimable.map((s) => s.id);

    expect(ownIds).toContain(ownShiftId);
    expect(ownIds).not.toContain(otherShiftId);
    expect(claimableIds).toContain(openShiftId);
    expect(claimableIds).not.toContain(otherShiftId);
  });

  it("RLS hides other employees' assignments and shifts from the raw API", async () => {
    const { data: assignments } = await aidenClient
      .from("shift_assignments")
      .select("employee_id");
    expect((assignments ?? []).every((a) => a.employee_id === AIDEN)).toBe(true);

    const { data: shifts } = await aidenClient.from("shifts").select("id");
    const ids = (shifts ?? []).map((s) => s.id);
    expect(ids).not.toContain(otherShiftId); // Maya's assigned shift
  });
});

describe("claim — approval mode + atomicity", () => {
  it("claim in require_approval is pending; a second claim fails", async () => {
    await setApprovalMode("require_approval");
    const shiftId = await insertOpenShift("2026-08-21T15:00:00Z", "2026-08-21T23:00:00Z");

    const first = await claimShift(admin, { shiftId, employeeId: AIDEN });
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.pending).toBe(true);

    const { data: assignment } = await admin
      .from("shift_assignments")
      .select("pending_approval, assigned_via")
      .eq("shift_id", shiftId)
      .single();
    expect(assignment!.pending_approval).toBe(true);
    expect(assignment!.assigned_via).toBe("claim");

    const second = await claimShift(admin, { shiftId, employeeId: MAYA });
    expect(second.ok).toBe(false);
  });

  it("claim in auto_publish is not pending", async () => {
    await setApprovalMode("auto_publish");
    const shiftId = await insertOpenShift("2026-08-20T15:00:00Z", "2026-08-20T23:00:00Z");

    const res = await claimShift(admin, { shiftId, employeeId: AIDEN });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.pending).toBe(false);

    const { data: assignment } = await admin
      .from("shift_assignments")
      .select("pending_approval")
      .eq("shift_id", shiftId)
      .single();
    expect(assignment!.pending_approval).toBe(false);
  });
});
