import { type NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { advanceExpiredTiers } from "@/lib/coverage/escalation";

// Always run fresh — this endpoint has side effects and must never be cached.
export const dynamic = "force-dynamic";

/**
 * Tier-timer sweep (SCH-23). Vercel Cron calls this every 2 minutes (see
 * vercel.json) with `Authorization: Bearer $CRON_SECRET`. It advances every
 * broadcast whose snapshotted tier window has expired (tier1 → tier2 → escalated)
 * and is idempotent, so a duplicate or overlapping run is harmless.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const summary = await advanceExpiredTiers(admin, { now: new Date() });
  return NextResponse.json({ ok: true, ...summary });
}
