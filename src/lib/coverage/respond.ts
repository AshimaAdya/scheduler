import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { resolveSettings } from "@/lib/settings/resolve";
import { LoggingNotificationService } from "@/lib/notifications/logging-service";
import type {
  NotificationMessage,
  NotificationService,
} from "@/lib/notifications/types";
import { findCoverageCandidates } from "./eligible";

/**
 * Responding to a broadcast cover request (sick-call / day-off). The accept is
 * atomic in the `accept_coverage` RPC (invariant #2 — first confirmed YES wins);
 * this layer authorizes, re-validates eligibility, picks up approval_mode, and
 * fans out the winner / reporter / loser notifications. Runs service-role.
 */

const ACTIVE_STATUSES = ["open", "tier1_broadcast", "tier2_broadcast", "escalated"];

export type RespondResult = { ok: true } | { ok: false; error: string };

export type CoverageAsk = {
  requestId: string;
  reporterName: string;
  trigger: string; // sick_call | day_off
  shift: {
    id: string;
    dateLabel: string;
    timeLabel: string;
    skill: string;
    locationName: string | null;
  };
};

type RequestRow = {
  id: string;
  status: string;
  trigger_type: string;
  requested_by: string;
  shift_id: string;
  covered_by: string | null;
};

async function loadRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<RequestRow | null> {
  const { data } = await supabase
    .from("coverage_requests")
    .select("id, status, trigger_type, requested_by, shift_id, covered_by")
    .eq("id", requestId)
    .maybeSingle();
  return (data as RequestRow | null) ?? null;
}

async function hasPendingOffer(
  supabase: SupabaseClient,
  requestId: string,
  employeeId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("coverage_offers")
    .select("id")
    .eq("coverage_request_id", requestId)
    .eq("employee_id", employeeId)
    .eq("response", "pending")
    .maybeSingle();
  return !!data;
}

/**
 * A candidate accepts a cover request. The winner takes the shift and the request
 * is covered atomically; simultaneous accepts resolve to exactly one winner, and
 * everyone else gets a polite "already covered".
 */
export async function acceptCoverageOffer(
  supabase: SupabaseClient,
  params: { requestId: string; actorEmployeeId: string; notifier?: NotificationService },
): Promise<RespondResult> {
  const req = await loadRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "This request no longer exists." };
  if (req.trigger_type === "direct_swap") return { ok: false, error: "Not a cover request." };
  if (req.covered_by || !ACTIVE_STATUSES.includes(req.status)) {
    return { ok: false, error: "This shift is already covered." };
  }
  if (!(await hasPendingOffer(supabase, req.id, params.actorEmployeeId))) {
    return { ok: false, error: "You weren't asked to cover this shift." };
  }

  // Re-validate eligibility now (availability/hours may have changed since asked).
  const candidates = await findCoverageCandidates(supabase, {
    shiftId: req.shift_id,
    reporterId: req.requested_by,
    sameLocationOnly: false,
  });
  if (!candidates.some((c) => c.id === params.actorEmployeeId)) {
    return { ok: false, error: "You're no longer eligible for this shift." };
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const autoApprove = resolveSettings(business?.settings).approval_mode !== "require_approval";

  // Collect who else was asked BEFORE the RPC expires their offers.
  const { data: otherOffers } = await supabase
    .from("coverage_offers")
    .select("employee_id")
    .eq("coverage_request_id", req.id)
    .neq("employee_id", params.actorEmployeeId);

  const { error } = await supabase.rpc("accept_coverage", {
    p_request_id: req.id,
    p_actor: params.actorEmployeeId,
    p_auto_approve: autoApprove,
  });
  if (error) {
    if ((error.message ?? "").includes("already_covered")) {
      return { ok: false, error: "This shift was just covered by someone else." };
    }
    return { ok: false, error: "Could not confirm — please try again." };
  }

  const notifier = params.notifier ?? new LoggingNotificationService(supabase);
  const messages: NotificationMessage[] = [
    {
      recipientEmployeeId: params.actorEmployeeId,
      channel: "sms",
      template: "coverage_you_are_covering",
      payload: { shiftId: req.shift_id },
      coverageRequestId: req.id,
    },
    {
      recipientEmployeeId: req.requested_by,
      channel: "sms",
      template: "coverage_confirmed",
      payload: { shiftId: req.shift_id },
      coverageRequestId: req.id,
    },
  ];
  for (const o of otherOffers ?? []) {
    messages.push({
      recipientEmployeeId: o.employee_id,
      channel: "sms",
      template: "coverage_already_covered",
      payload: { shiftId: req.shift_id },
      coverageRequestId: req.id,
    });
  }
  const { data: managers } = await supabase
    .from("employees")
    .select("id")
    .in("role", ["manager", "admin"])
    .eq("active", true);
  for (const m of managers ?? []) {
    messages.push({
      recipientEmployeeId: m.id,
      channel: "email",
      template: "coverage_resolved",
      payload: { shiftId: req.shift_id, trigger: req.trigger_type },
      coverageRequestId: req.id,
    });
  }
  await notifier.send(messages);

  return { ok: true };
}

/** A candidate declines being asked to cover. Marks their offer; no status change. */
export async function declineCoverageOffer(
  supabase: SupabaseClient,
  params: { requestId: string; actorEmployeeId: string },
): Promise<RespondResult> {
  const { data } = await supabase
    .from("coverage_offers")
    .update({ response: "declined", responded_at: new Date().toISOString() })
    .eq("coverage_request_id", params.requestId)
    .eq("employee_id", params.actorEmployeeId)
    .eq("response", "pending")
    .select("id");
  if (!data || data.length === 0) {
    return { ok: false, error: "There's nothing to decline." };
  }
  return { ok: true };
}

/** Shifts this employee is currently being asked to cover (their pending offers). */
export async function getCoverageAsks(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<CoverageAsk[]> {
  const { data: offers } = await supabase
    .from("coverage_offers")
    .select("coverage_request_id")
    .eq("employee_id", employeeId)
    .eq("response", "pending");
  const requestIds = [...new Set((offers ?? []).map((o) => o.coverage_request_id))];
  if (requestIds.length === 0) return [];

  const { data: requests } = await supabase
    .from("coverage_requests")
    .select(
      "id, trigger_type, requested_by, status, shifts:shift_id(id, starts_at, ends_at, required_skill, locations:location_id(name))",
    )
    .in("id", requestIds)
    .in("status", ACTIVE_STATUSES);
  if (!requests || requests.length === 0) return [];

  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const tz = resolveSettings(business?.settings).timezone;

  const reporterIds = [...new Set(requests.map((r) => r.requested_by))];
  const { data: emps } = await supabase
    .from("employees")
    .select("id, full_name")
    .in("id", reporterIds);
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  type ShiftEmbed = {
    id: string;
    starts_at: string;
    ends_at: string;
    required_skill: string;
    locations: { name: string } | { name: string }[] | null;
  };

  const asks: CoverageAsk[] = [];
  for (const r of requests) {
    const rel = r.shifts as ShiftEmbed | ShiftEmbed[] | null;
    const shift = Array.isArray(rel) ? rel[0] : rel;
    if (!shift) continue;
    const loc = shift.locations;
    const locationName = Array.isArray(loc) ? (loc[0]?.name ?? null) : (loc?.name ?? null);
    asks.push({
      requestId: r.id,
      reporterName: nameById.get(r.requested_by) ?? "A coworker",
      trigger: r.trigger_type,
      shift: {
        id: shift.id,
        dateLabel: formatInTimeZone(new Date(shift.starts_at), tz, "EEE MMM d"),
        timeLabel: `${formatInTimeZone(new Date(shift.starts_at), tz, "HH:mm")}–${formatInTimeZone(new Date(shift.ends_at), tz, "HH:mm")}`,
        skill: shift.required_skill,
        locationName,
      },
    });
  }
  return asks;
}
