/**
 * Wait-window snapshot test (SCH-11).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves the AC: changing wait-windows affects NEW coverage requests only —
 * in-flight requests keep the window snapshotted at their creation. This is the
 * exact pattern the coverage engine (SCH-19+) will use via waitWindowsFor().
 *
 * Everything runs in one transaction that is rolled back, so the seed (including
 * businesses.settings) is left untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { resolveSettings } from "@/lib/settings/resolve";
import { waitWindowsFor } from "@/lib/settings/wait-windows";

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";

const BUSINESS_ID = "00000000-0000-0000-0000-000000000001";
const LOCATION_ID = "10000000-0000-0000-0000-000000000001"; // Gastown
const REQUESTER_ID = "20000000-0000-0000-0000-000000000004"; // Liam

const client = new Client({ connectionString: DB_URL });
let shiftId: string;

async function createSickCallRequest(tier1: number, tier2: number): Promise<string> {
  const res = await client.query(
    `insert into coverage_requests
       (shift_id, requested_by, trigger_type, status, tier1_wait_minutes, tier2_wait_minutes)
     values ($1, $2, 'sick_call', 'tier1_broadcast', $3, $4)
     returning id`,
    [shiftId, REQUESTER_ID, tier1, tier2],
  );
  return res.rows[0].id;
}

beforeAll(async () => {
  await client.connect();
  await client.query("BEGIN");

  const schedule = await client.query(
    `insert into schedules (location_id, week_start, status)
     values ($1, date '2026-07-13', 'published') returning id`,
    [LOCATION_ID],
  );
  const shift = await client.query(
    `insert into shifts (schedule_id, location_id, starts_at, ends_at, required_skill)
     values ($1, $2, timestamptz '2026-07-15 16:00+00', timestamptz '2026-07-16 00:00+00', 'barista')
     returning id`,
    [schedule.rows[0].id, LOCATION_ID],
  );
  shiftId = shift.rows[0].id;
});

afterAll(async () => {
  await client.query("ROLLBACK");
  await client.end();
});

describe("wait-window snapshot", () => {
  it("keeps in-flight requests on their original window when settings change", async () => {
    // Read current settings and snapshot the sick_call window onto a request.
    const before = await client.query(
      `select settings from businesses where id = $1`,
      [BUSINESS_ID],
    );
    const oldWindow = waitWindowsFor(
      resolveSettings(before.rows[0].settings),
      "sick_call",
    );
    const inFlightId = await createSickCallRequest(
      oldWindow.tier1_minutes,
      oldWindow.tier2_minutes,
    );

    // Manager changes the sick_call windows.
    await client.query(
      `update businesses
         set settings = jsonb_set(settings, '{wait_windows,sick_call}', $2::jsonb)
       where id = $1`,
      [BUSINESS_ID, JSON.stringify({ tier1_minutes: 5, tier2_minutes: 7 })],
    );

    // The in-flight request still has the OLD window.
    const still = await client.query(
      `select tier1_wait_minutes, tier2_wait_minutes from coverage_requests where id = $1`,
      [inFlightId],
    );
    expect(still.rows[0].tier1_wait_minutes).toBe(oldWindow.tier1_minutes);
    expect(still.rows[0].tier2_wait_minutes).toBe(oldWindow.tier2_minutes);

    // A NEW request created after the change picks up the new window.
    const after = await client.query(
      `select settings from businesses where id = $1`,
      [BUSINESS_ID],
    );
    const newWindow = waitWindowsFor(
      resolveSettings(after.rows[0].settings),
      "sick_call",
    );
    expect(newWindow).toEqual({ tier1_minutes: 5, tier2_minutes: 7 });

    const newId = await createSickCallRequest(
      newWindow.tier1_minutes,
      newWindow.tier2_minutes,
    );
    const fresh = await client.query(
      `select tier1_wait_minutes, tier2_wait_minutes from coverage_requests where id = $1`,
      [newId],
    );
    expect(fresh.rows[0].tier1_wait_minutes).toBe(5);
    expect(fresh.rows[0].tier2_wait_minutes).toBe(7);

    // And the in-flight one is unchanged relative to the new one.
    expect(still.rows[0].tier1_wait_minutes).not.toBe(5);
  });
});
