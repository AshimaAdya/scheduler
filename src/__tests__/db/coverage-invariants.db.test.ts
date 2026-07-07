/**
 * DB-level invariant tests for coverage_requests.
 *
 * Runs against a live local Supabase Postgres:
 *   npx supabase start
 *   npm run test:db
 *
 * These prove the invariants are enforced by the DATABASE (CHECK constraints),
 * not just application code — so no code path, not even service_role, can
 * approve time-off before coverage is confirmed.
 *
 * Everything runs inside one transaction that is rolled back, so the DB is left
 * untouched. Each mutating step uses a SAVEPOINT so an expected violation does
 * not poison later assertions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const DB_URL =
  process.env.SUPABASE_DB_URL ??
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";

const LOCATION_ID = "10000000-0000-0000-0000-000000000001"; // Gastown (seed)
const REQUESTER_ID = "20000000-0000-0000-0000-000000000004"; // Liam (seed)
const COVERER_ID = "20000000-0000-0000-0000-000000000005"; // Sofia (seed)

const client = new Client({ connectionString: DB_URL });
let shiftId: string;

/** Run `fn` in a savepoint; roll back afterward. Returns any thrown error. */
async function inSavepoint(fn: () => Promise<void>): Promise<Error | null> {
  await client.query("SAVEPOINT sp");
  try {
    await fn();
    await client.query("RELEASE SAVEPOINT sp");
    return null;
  } catch (err) {
    await client.query("ROLLBACK TO SAVEPOINT sp");
    return err as Error;
  }
}

beforeAll(async () => {
  await client.connect();
  await client.query("BEGIN");

  // A schedule + shift for the coverage requests to reference.
  const schedule = await client.query(
    `insert into schedules (location_id, week_start, status)
     values ($1, date '2026-07-06', 'draft')
     returning id`,
    [LOCATION_ID],
  );
  const scheduleId = schedule.rows[0].id;

  const shift = await client.query(
    `insert into shifts (schedule_id, location_id, starts_at, ends_at, required_skill)
     values ($1, $2, timestamptz '2026-07-08 16:00+00', timestamptz '2026-07-09 00:00+00', 'barista')
     returning id`,
    [scheduleId, LOCATION_ID],
  );
  shiftId = shift.rows[0].id;
});

afterAll(async () => {
  await client.query("ROLLBACK");
  await client.end();
});

describe("coverage_requests DB invariants", () => {
  it("rejects an INSERT that approves time-off while status is not 'covered'", async () => {
    const err = await inSavepoint(async () => {
      await client.query(
        `insert into coverage_requests
           (shift_id, requested_by, trigger_type, status, time_off_approved_at)
         values ($1, $2, 'day_off', 'open', now())`,
        [shiftId, REQUESTER_ID],
      );
    });
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/time_off_approved_requires_coverage/);
  });

  it("rejects an UPDATE that approves time-off while status is 'open'", async () => {
    const err = await inSavepoint(async () => {
      const inserted = await client.query(
        `insert into coverage_requests
           (shift_id, requested_by, trigger_type, status)
         values ($1, $2, 'day_off', 'open')
         returning id`,
        [shiftId, REQUESTER_ID],
      );
      const id = inserted.rows[0].id;
      await client.query(
        `update coverage_requests set time_off_approved_at = now() where id = $1`,
        [id],
      );
    });
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/time_off_approved_requires_coverage/);
  });

  it("allows time-off approval once the request is 'covered'", async () => {
    const err = await inSavepoint(async () => {
      const inserted = await client.query(
        `insert into coverage_requests
           (shift_id, requested_by, trigger_type, status)
         values ($1, $2, 'day_off', 'open')
         returning id`,
        [shiftId, REQUESTER_ID],
      );
      const id = inserted.rows[0].id;

      // Confirm coverage (the atomic-claim shape), then approve — must succeed.
      await client.query(
        `update coverage_requests
           set covered_by = $2, status = 'covered', covered_at = now()
         where id = $1 and covered_by is null`,
        [id, COVERER_ID],
      );
      await client.query(
        `update coverage_requests set time_off_approved_at = now() where id = $1`,
        [id],
      );
    });
    expect(err).toBeNull();
  });

  it("rejects status 'covered' without a covered_by", async () => {
    const err = await inSavepoint(async () => {
      await client.query(
        `insert into coverage_requests
           (shift_id, requested_by, trigger_type, status)
         values ($1, $2, 'sick_call', 'covered')`,
        [shiftId, REQUESTER_ID],
      );
    });
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/covered_requires_covered_by/);
  });

  it("rejects swap-only fields on a non-swap trigger", async () => {
    const err = await inSavepoint(async () => {
      await client.query(
        `insert into coverage_requests
           (shift_id, requested_by, trigger_type, status, trade_type)
         values ($1, $2, 'sick_call', 'open', 'two_way')`,
        [shiftId, REQUESTER_ID],
      );
    });
    expect(err).not.toBeNull();
    expect(err?.message).toMatch(/coverage_swap_fields_only_for_swap/);
  });
});
