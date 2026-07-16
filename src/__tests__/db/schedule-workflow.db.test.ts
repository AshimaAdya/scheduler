/**
 * Draft/publish workflow integration test (SCH-14).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Covers the ACs: both approval modes end to end; re-generating replaces a draft
 * but never a published schedule; editing a published schedule writes an audit
 * entry; publishing logs notifications (via the stub service).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  generateScheduleForWeek,
  publishSchedule,
  reassignShift,
} from "@/lib/schedule/service";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2026-08-03"; // a Monday
const LIAM = "20000000-0000-0000-0000-000000000004";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let originalSettings: unknown;
let businessId: string;

async function setApprovalMode(mode: "auto_publish" | "require_approval") {
  const current = (originalSettings ?? {}) as Record<string, unknown>;
  await admin
    .from("businesses")
    .update({ settings: { ...current, approval_mode: mode } })
    .eq("id", businessId);
}

beforeAll(async () => {
  const { data } = await admin
    .from("businesses")
    .select("id, settings")
    .limit(1)
    .single();
  businessId = data!.id;
  originalSettings = data!.settings;
});

afterEach(async () => {
  await admin.from("schedules").delete().eq("location_id", GASTOWN).eq("week_start", WEEK);
  await admin.from("notifications_log").delete().eq("template", "schedule_published");
});

afterAll(async () => {
  await admin.from("businesses").update({ settings: originalSettings }).eq("id", businessId);
});

describe("generate — approval modes", () => {
  it("require_approval leaves the schedule as a draft", async () => {
    await setApprovalMode("require_approval");
    const res = await generateScheduleForWeek(admin, {
      locationId: GASTOWN,
      weekStart: WEEK,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.status).toBe("draft");
      expect(res.assigned).toBeGreaterThan(0);
    }

    const { data: sched } = await admin
      .from("schedules")
      .select("status")
      .eq("location_id", GASTOWN)
      .eq("week_start", WEEK)
      .single();
    expect(sched!.status).toBe("draft");

    const { count } = await admin
      .from("schedule_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", res.ok ? res.scheduleId : "")
      .eq("action", "generated");
    expect(count).toBe(1);
  });

  it("auto_publish publishes immediately and logs notifications", async () => {
    await setApprovalMode("auto_publish");
    const res = await generateScheduleForWeek(admin, {
      locationId: GASTOWN,
      weekStart: WEEK,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.status).toBe("published");

    const { data: sched } = await admin
      .from("schedules")
      .select("status")
      .eq("id", res.scheduleId)
      .single();
    expect(sched!.status).toBe("published");

    // Notifications logged for the assigned employees.
    const { count: notifs } = await admin
      .from("notifications_log")
      .select("id", { count: "exact", head: true })
      .eq("template", "schedule_published");
    expect(notifs).toBeGreaterThan(0);

    const { count: published } = await admin
      .from("schedule_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", res.scheduleId)
      .eq("action", "published");
    expect(published).toBe(1);
  });
});

describe("re-generate", () => {
  it("replaces a draft but refuses to touch a published schedule", async () => {
    await setApprovalMode("require_approval");

    const first = await generateScheduleForWeek(admin, { locationId: GASTOWN, weekStart: WEEK });
    expect(first.ok).toBe(true);
    const firstId = first.ok ? first.scheduleId : "";

    const second = await generateScheduleForWeek(admin, { locationId: GASTOWN, weekStart: WEEK });
    expect(second.ok).toBe(true);
    const secondId = second.ok ? second.scheduleId : "";
    expect(secondId).not.toBe(firstId);

    // Exactly one schedule for the week (the old draft was replaced).
    const { count } = await admin
      .from("schedules")
      .select("id", { count: "exact", head: true })
      .eq("location_id", GASTOWN)
      .eq("week_start", WEEK);
    expect(count).toBe(1);

    // Publish, then a re-generate must be refused and leave it published.
    await publishSchedule(admin, { scheduleId: secondId });
    const third = await generateScheduleForWeek(admin, { locationId: GASTOWN, weekStart: WEEK });
    expect(third.ok).toBe(false);

    const { data: still } = await admin
      .from("schedules")
      .select("id, status")
      .eq("location_id", GASTOWN)
      .eq("week_start", WEEK)
      .single();
    expect(still!.id).toBe(secondId);
    expect(still!.status).toBe("published");
  });
});

describe("edit published → audit", () => {
  it("reassigning a shift on a published schedule writes an audit entry", async () => {
    await setApprovalMode("auto_publish");
    const res = await generateScheduleForWeek(admin, { locationId: GASTOWN, weekStart: WEEK });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const { data: shifts } = await admin
      .from("shifts")
      .select("id")
      .eq("schedule_id", res.scheduleId)
      .limit(1);
    const shiftId = shifts![0].id;

    await reassignShift(admin, { shiftId, employeeId: LIAM });

    const { count } = await admin
      .from("schedule_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("schedule_id", res.scheduleId)
      .eq("action", "edited");
    expect(count).toBe(1);
  });
});
