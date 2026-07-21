import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { cronFreshness } from "@/lib/coverage/heartbeat";

export const dynamic = "force-dynamic";

/**
 * Health check (SCH-31). Reports database reachability and tier-cron freshness.
 * Returns 200 when healthy, 503 when the DB is unreachable or the cron is stale
 * (the dead-man condition) — this is what an uptime monitor / Sentry Cron pings.
 * Public and secret-free by design.
 */
export async function GET(): Promise<NextResponse> {
  const admin = createServiceRoleClient();

  let db = false;
  try {
    const { error } = await admin
      .from("businesses")
      .select("id", { count: "exact", head: true });
    db = !error;
  } catch {
    db = false;
  }

  const cron = await cronFreshness(admin).catch(() => ({ lastRunAt: null, stale: true }));
  const ok = db && !cron.stale;

  return NextResponse.json({ ok, db, cron }, { status: ok ? 200 : 503 });
}
