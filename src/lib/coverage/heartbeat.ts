import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Cron dead-man switch (SCH-31). The tier-timer cron stamps a heartbeat each run;
 * the health endpoint treats the coverage engine as degraded once the stamp is
 * older than the threshold (default 10 min = five missed 2-minute runs).
 */
const TIER_CRON_KEY = "tier_cron";

/** Pure staleness check — unit-tested with a fixed clock. */
export function isStale(
  lastRunAt: string | null,
  thresholdMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!lastRunAt) return true;
  return now.getTime() - new Date(lastRunAt).getTime() > thresholdMinutes * 60_000;
}

/** Record that the tier cron just ran (service-role). */
export async function recordCronRun(supabase: SupabaseClient): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("system_heartbeats")
    .upsert({ key: TIER_CRON_KEY, last_run_at: now, updated_at: now }, { onConflict: "key" });
}

export type CronFreshness = { lastRunAt: string | null; stale: boolean };

export async function cronFreshness(
  supabase: SupabaseClient,
  thresholdMinutes = 10,
): Promise<CronFreshness> {
  const { data } = await supabase
    .from("system_heartbeats")
    .select("last_run_at")
    .eq("key", TIER_CRON_KEY)
    .maybeSingle();
  const lastRunAt = data?.last_run_at ?? null;
  return { lastRunAt, stale: isStale(lastRunAt, thresholdMinutes) };
}
