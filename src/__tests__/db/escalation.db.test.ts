/**
 * Tier timers + escalation (SCH-23).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * A request whose 1-minute window has expired advances tier1 → tier2 (opening the
 * search to another location) and then tier2 → escalated (manager gets the
 * asked/declined/no-response breakdown). Running the sweep twice is a no-op.
 *
 * The sweep is global, so the test clock is anchored to real time: every other
 * db-test file uses ≥20-minute windows with real-time expiry, so this test's
 * near-now clock only ever selects its own deliberately-expired request.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { transition } from "@/lib/coverage/transition";
import { advanceExpiredTiers } from "@/lib/coverage/escalation";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const GASTOWN = "10000000-0000-0000-0000-000000000001";
const WEEK = "2027-01-04"; // distinct week for this db-test file
const LIAM = "20000000-0000-0000-0000-000000000004"; //  reporter (Gastown)
const SOFIA = "20000000-0000-0000-0000-000000000005"; // tier-1 (Gastown)
const AIDEN = "20000000-0000-0000-0000-000000000008"; // tier-2 (Kitsilano)

// Mon 2027-01-04, 13:00–16:00 local (PST, UTC-8 → 21:00Z). Aiden (Kitsilano) is
// available Mon 08:00–17:00 per seed, so tier-2 reaches him.
const S_START = "2027-01-04T21:00:00Z";
const S_END = "2027-01-05T00:00:00Z";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let shiftId: string;

/** A request already sitting in tier1 with an expiry `minsAgo` in the past. */
async function expiredTier1(minsAgo: number, base: number): Promise<string> {
  const { data: req } = await admin
    .from("coverage_requests")
    .insert({
      shift_id: shiftId,
      requested_by: LIAM,
      trigger_type: "sick_call",
      status: "open",
      tier1_wait_minutes: 1,
      tier2_wait_minutes: 1,
    })
    .select("id")
    .single();
  await transition(admin, {
    requestId: req!.id,
    to: "tier1_broadcast",
    patch: { tier_expires_at: new Date(base - minsAgo * 60_000).toISOString() },
  });
  // The same-location tier-1 ask that already went out.
  await admin
    .from("coverage_offers")
    .insert({ coverage_request_id: req!.id, employee_id: SOFIA, tier: 1, response: "pending" });
  return req!.id;
}

async function statusOf(id: string): Promise<string> {
  const { data } = await admin
    .from("coverage_requests")
    .select("status")
    .eq("id", id)
    .single();
  return data!.status;
}

async function offerCount(id: string): Promise<number> {
  const { count } = await admin
    .from("coverage_offers")
    .select("id", { count: "exact", head: true })
    .eq("coverage_request_id", id);
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
  await admin.from("notifications_log").delete().eq("recipient_employee_id", AIDEN);
  await admin.from("coverage_requests").delete().eq("shift_id", shiftId);
});

afterAll(async () => {
  await admin.from("schedules").delete().eq("location_id", GASTOWN).eq("week_start", WEEK);
  await admin
    .from("notifications_log")
    .delete()
    .in("template", ["coverage_ask_other_location", "coverage_escalated"]);
});

describe("advanceExpiredTiers", () => {
  it("advances an expired tier1 to tier2, reaching another location", async () => {
    const base = Date.now();
    const id = await expiredTier1(5, base);

    const summary = await advanceExpiredTiers(admin, { now: new Date(base) });
    expect(summary.advanced).toBe(1);
    expect(await statusOf(id)).toBe("tier2_broadcast");

    // Aiden (Kitsilano) now has a tier-2 offer; the window is re-armed to future.
    const { data: aidenOffer } = await admin
      .from("coverage_offers")
      .select("tier")
      .eq("coverage_request_id", id)
      .eq("employee_id", AIDEN)
      .maybeSingle();
    expect(aidenOffer?.tier).toBe(2);

    const { data: req } = await admin
      .from("coverage_requests")
      .select("tier_expires_at")
      .eq("id", id)
      .single();
    expect(new Date(req!.tier_expires_at).getTime()).toBeGreaterThan(base);
  });

  it("is idempotent — a second sweep at the same clock does nothing", async () => {
    const base = Date.now();
    const id = await expiredTier1(5, base);

    await advanceExpiredTiers(admin, { now: new Date(base) });
    const afterFirst = await offerCount(id);

    const second = await advanceExpiredTiers(admin, { now: new Date(base) });
    expect(second.advanced).toBe(0); // re-armed expiry is in the future now
    expect(await statusOf(id)).toBe("tier2_broadcast");
    expect(await offerCount(id)).toBe(afterFirst); // no duplicate offers
  });

  it("escalates an expired tier2 with an asked/declined/no-response summary", async () => {
    const base = Date.now();
    const id = await expiredTier1(5, base);
    await advanceExpiredTiers(admin, { now: new Date(base) }); // → tier2, expiry base+1m

    // Sofia says no; the tier-2 asks go unanswered.
    await admin
      .from("coverage_offers")
      .update({ response: "declined", responded_at: new Date().toISOString() })
      .eq("coverage_request_id", id)
      .eq("employee_id", SOFIA);

    const summary = await advanceExpiredTiers(admin, { now: new Date(base + 2 * 60_000) });
    expect(summary.escalated).toBe(1);
    expect(await statusOf(id)).toBe("escalated");

    const { count: auditCount } = await admin
      .from("coverage_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("coverage_request_id", id)
      .eq("to_status", "escalated");
    expect(auditCount).toBe(1);

    const { data: note } = await admin
      .from("notifications_log")
      .select("payload")
      .eq("coverage_request_id", id)
      .eq("template", "coverage_escalated")
      .limit(1)
      .single();
    const payload = note!.payload as { declined: string[]; noResponse: string[] };
    expect(payload.declined).toContain("Sofia Martins");
    expect(payload.noResponse).toContain("Aiden Kaur");
  });
});
