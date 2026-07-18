import type { SupabaseClient } from "@supabase/supabase-js";
import { LoggingNotificationService } from "@/lib/notifications/logging-service";
import type {
  NotificationMessage,
  NotificationService,
} from "@/lib/notifications/types";
import { transition } from "./transition";
import { findCoverageCandidates } from "./eligible";

/**
 * Tier timers + escalation (SCH-23). A sweeper (driven by Vercel Cron, see
 * app/api/cron/coverage-tiers) advances broadcasts whose snapshotted window has
 * expired: tier1 → tier2 (open the search to other locations), tier2 → escalated
 * (hand it to a manager with an asked/declined/no-response summary).
 *
 * The tier decision is a PURE function of the request + clock so it's testable
 * with a fake clock; the orchestration reuses transition()/findCoverageCandidates
 * so nothing is duplicated. Idempotency comes free from transition()'s
 * compare-and-swap: two overlapping sweeps can't both advance the same request.
 */

export type TierRequest = {
  status: string;
  tier_expires_at: string | null;
  tier2_wait_minutes: number | null;
};

export type TierAction =
  | { kind: "advance_to_tier2"; newExpiresAt: string }
  | { kind: "escalate" }
  | { kind: "none" };

/** What (if anything) should happen to a broadcast at time `now`. Pure. */
export function nextTierAction(req: TierRequest, now: Date): TierAction {
  if (!req.tier_expires_at) return { kind: "none" };
  if (new Date(req.tier_expires_at).getTime() > now.getTime()) return { kind: "none" };

  if (req.status === "tier1_broadcast") {
    const minutes = req.tier2_wait_minutes ?? 0;
    return {
      kind: "advance_to_tier2",
      newExpiresAt: new Date(now.getTime() + minutes * 60_000).toISOString(),
    };
  }
  if (req.status === "tier2_broadcast") return { kind: "escalate" };
  return { kind: "none" };
}

export type SweepSummary = { advanced: number; escalated: number; skipped: number };

type SweepRequest = TierRequest & {
  id: string;
  shift_id: string;
  requested_by: string;
  trigger_type: string;
};

/**
 * Find every broadcast whose current tier window has expired and advance it.
 * Service-role (writes offers/audit/notifications). `now` is injectable so tests
 * control the clock.
 */
export async function advanceExpiredTiers(
  supabase: SupabaseClient,
  opts: { now?: Date; notifier?: NotificationService } = {},
): Promise<SweepSummary> {
  const now = opts.now ?? new Date();
  const notifier = opts.notifier ?? new LoggingNotificationService(supabase);
  const summary: SweepSummary = { advanced: 0, escalated: 0, skipped: 0 };

  const { data: requests } = await supabase
    .from("coverage_requests")
    .select(
      "id, shift_id, requested_by, trigger_type, status, tier_expires_at, tier2_wait_minutes",
    )
    .in("status", ["tier1_broadcast", "tier2_broadcast"])
    .lt("tier_expires_at", now.toISOString());

  for (const req of (requests ?? []) as SweepRequest[]) {
    const action = nextTierAction(req, now);
    try {
      if (action.kind === "advance_to_tier2") {
        await advanceToTier2(supabase, req, action.newExpiresAt, notifier);
        summary.advanced++;
      } else if (action.kind === "escalate") {
        await escalate(supabase, req, notifier);
        summary.escalated++;
      } else {
        summary.skipped++;
      }
    } catch {
      // A concurrent sweep already advanced this request (TransitionConflictError)
      // or a transient error occurred — skip it; a later sweep retries if needed.
      summary.skipped++;
    }
  }
  return summary;
}

async function advanceToTier2(
  supabase: SupabaseClient,
  req: SweepRequest,
  newExpiresAt: string,
  notifier: NotificationService,
): Promise<void> {
  // Everyone eligible anywhere, minus whoever was already asked (the tier-1,
  // same-location pool) — i.e. the other-location shared staff.
  const candidates = await findCoverageCandidates(supabase, {
    shiftId: req.shift_id,
    reporterId: req.requested_by,
    sameLocationOnly: false,
  });
  const { data: existing } = await supabase
    .from("coverage_offers")
    .select("employee_id")
    .eq("coverage_request_id", req.id);
  const already = new Set((existing ?? []).map((o) => o.employee_id));
  const fresh = candidates.filter((c) => !already.has(c.id));

  // Advance first (compare-and-swap): only the winning sweep proceeds.
  await transition(supabase, {
    requestId: req.id,
    to: "tier2_broadcast",
    patch: { tier_expires_at: newExpiresAt },
    detail: { fromTier: 1, newCandidates: fresh.length },
  });

  if (fresh.length > 0) {
    await supabase.from("coverage_offers").insert(
      fresh.map((c) => ({
        coverage_request_id: req.id,
        employee_id: c.id,
        tier: 2,
        response: "pending" as const,
      })),
    );
  }

  const messages: NotificationMessage[] = fresh.map((c) => ({
    recipientEmployeeId: c.id,
    channel: "sms",
    template: "coverage_ask_other_location",
    payload: { shiftId: req.shift_id, trigger: req.trigger_type },
    coverageRequestId: req.id,
  }));
  await notifier.send(messages);
}

async function escalate(
  supabase: SupabaseClient,
  req: SweepRequest,
  notifier: NotificationService,
): Promise<void> {
  const { data: offers } = await supabase
    .from("coverage_offers")
    .select("employee_id, response")
    .eq("coverage_request_id", req.id);
  const rows = offers ?? [];
  const askedIds = rows.map((o) => o.employee_id);
  const declinedIds = rows.filter((o) => o.response === "declined").map((o) => o.employee_id);
  const noResponseIds = rows.filter((o) => o.response === "pending").map((o) => o.employee_id);

  const { data: emps } = askedIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", askedIds)
    : { data: [] };
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));
  const names = (ids: string[]) => ids.map((id) => nameById.get(id) ?? "Someone");

  // Escalate first (compare-and-swap): only the winning sweep notifies.
  await transition(supabase, {
    requestId: req.id,
    to: "escalated",
    detail: {
      asked: askedIds.length,
      declined: declinedIds.length,
      noResponse: noResponseIds.length,
    },
  });

  const { data: managers } = await supabase
    .from("employees")
    .select("id")
    .in("role", ["manager", "admin"])
    .eq("active", true);
  const messages: NotificationMessage[] = (managers ?? []).map((m) => ({
    recipientEmployeeId: m.id,
    channel: "email",
    template: "coverage_escalated",
    payload: {
      shiftId: req.shift_id,
      trigger: req.trigger_type,
      asked: names(askedIds),
      declined: names(declinedIds),
      noResponse: names(noResponseIds),
    },
    coverageRequestId: req.id,
  }));
  await notifier.send(messages);
}
