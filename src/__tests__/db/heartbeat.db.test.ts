/**
 * Cron dead-man heartbeat (SCH-31).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * recordCronRun stamps the tier-cron heartbeat and cronFreshness reports fresh
 * right after and stale for an old stamp (the alert condition).
 */
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { recordCronRun, cronFreshness } from "@/lib/coverage/heartbeat";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Leave the heartbeat fresh so a manual /api/health check isn't left degraded.
afterAll(() => recordCronRun(admin));

describe("cron heartbeat", () => {
  it("is fresh right after a run and stale for an old stamp", async () => {
    await recordCronRun(admin);
    const fresh = await cronFreshness(admin);
    expect(fresh.stale).toBe(false);
    expect(fresh.lastRunAt).not.toBeNull();

    await admin
      .from("system_heartbeats")
      .update({ last_run_at: new Date(Date.now() - 30 * 60_000).toISOString() })
      .eq("key", "tier_cron");

    const stale = await cronFreshness(admin);
    expect(stale.stale).toBe(true);
  });
});
