import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSettings } from "@/lib/settings/resolve";
import { LoggingNotificationService } from "@/lib/notifications/logging-service";
import type { NotificationService } from "@/lib/notifications/types";
import { transition } from "./transition";
import { findCoverageCandidates } from "./eligible";

/**
 * Manager override controls (SCH-24). A manager can always intervene on an active
 * coverage request — the automation never locks them out. Four actions:
 *   1. assign someone directly (skips remaining tiers),
 *   2. cancel the request,
 *   3. force-approve the absence uncovered (shift left unfilled),
 *   4. resolve manually (handled outside the system).
 * Every action is audit-logged via transition()/coverage_transition with the
 * acting manager, the action, and a timestamp. Runs service-role (the action
 * layer authorizes the manager first).
 */

const ACTIVE_STATUSES = ["open", "tier1_broadcast", "tier2_broadcast", "escalated"];

export type OverrideResult = { ok: true } | { ok: false; error: string };
export type AssignOption = { id: string; full_name: string };

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

function notifyReporter(
  notifier: NotificationService,
  req: RequestRow,
  template: string,
) {
  return notifier.send([
    {
      recipientEmployeeId: req.requested_by,
      channel: "sms",
      template,
      payload: { shiftId: req.shift_id },
      coverageRequestId: req.id,
    },
  ]);
}

/**
 * Assign a chosen employee directly and cover the request. Validates eligibility
 * unless `overrideEligibility` is set (emergency assign — logged as such).
 */
export async function managerAssign(
  supabase: SupabaseClient,
  params: {
    requestId: string;
    assigneeId: string;
    actorId: string;
    overrideEligibility?: boolean;
    notifier?: NotificationService;
  },
): Promise<OverrideResult> {
  const req = await loadRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "Request not found." };
  if (req.trigger_type === "direct_swap") return { ok: false, error: "Not a cover request." };
  if (req.covered_by || !ACTIVE_STATUSES.includes(req.status)) {
    return { ok: false, error: "This request is already resolved." };
  }

  if (!params.overrideEligibility) {
    const eligible = await findCoverageCandidates(supabase, {
      shiftId: req.shift_id,
      reporterId: req.requested_by,
      sameLocationOnly: false,
    });
    if (!eligible.some((c) => c.id === params.assigneeId)) {
      return { ok: false, error: "Not eligible — turn on override to assign anyway." };
    }
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const autoApprove = resolveSettings(business?.settings).approval_mode !== "require_approval";

  const { error } = await supabase.rpc("manager_assign_coverage", {
    p_request_id: params.requestId,
    p_assignee: params.assigneeId,
    p_actor: params.actorId,
    p_auto_approve: autoApprove,
    p_detail: {
      action: "manager_assign",
      overrideEligibility: !!params.overrideEligibility,
    },
  });
  if (error) {
    if ((error.message ?? "").includes("already_resolved")) {
      return { ok: false, error: "This request was just resolved." };
    }
    return { ok: false, error: "Could not assign — please try again." };
  }

  const notifier = params.notifier ?? new LoggingNotificationService(supabase);
  await notifier.send([
    {
      recipientEmployeeId: params.assigneeId,
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
  ]);
  return { ok: true };
}

/** Cancel the search — the reporter keeps the shift. */
export async function cancelRequest(
  supabase: SupabaseClient,
  params: { requestId: string; actorId: string; notifier?: NotificationService },
): Promise<OverrideResult> {
  const req = await loadRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "Request not found." };
  if (!ACTIVE_STATUSES.includes(req.status)) {
    return { ok: false, error: "This request is already resolved." };
  }
  try {
    await transition(supabase, {
      requestId: req.id,
      to: "cancelled",
      actorEmployeeId: params.actorId,
      detail: { action: "cancel" },
    });
  } catch {
    return { ok: false, error: "This request was just resolved." };
  }
  const notifier = params.notifier ?? new LoggingNotificationService(supabase);
  await notifyReporter(notifier, req, "coverage_cancelled");
  return { ok: true };
}

/**
 * Approve the absence with no cover: remove the reporter's assignment (shift goes
 * unfilled) and resolve the request.
 */
export async function forceApproveUncovered(
  supabase: SupabaseClient,
  params: { requestId: string; actorId: string; notifier?: NotificationService },
): Promise<OverrideResult> {
  const req = await loadRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "Request not found." };
  if (!ACTIVE_STATUSES.includes(req.status)) {
    return { ok: false, error: "This request is already resolved." };
  }
  // Leave the shift unfilled.
  await supabase
    .from("shift_assignments")
    .delete()
    .eq("shift_id", req.shift_id)
    .eq("employee_id", req.requested_by);
  try {
    await transition(supabase, {
      requestId: req.id,
      to: "manager_resolved",
      actorEmployeeId: params.actorId,
      detail: { action: "force_uncovered" },
    });
  } catch {
    return { ok: false, error: "This request was just resolved." };
  }
  const notifier = params.notifier ?? new LoggingNotificationService(supabase);
  await notifyReporter(notifier, req, "coverage_absence_approved");
  return { ok: true };
}

/** Mark the request handled outside the system; leave assignments untouched. */
export async function resolveManually(
  supabase: SupabaseClient,
  params: { requestId: string; actorId: string; notifier?: NotificationService },
): Promise<OverrideResult> {
  const req = await loadRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "Request not found." };
  if (!ACTIVE_STATUSES.includes(req.status)) {
    return { ok: false, error: "This request is already resolved." };
  }
  try {
    await transition(supabase, {
      requestId: req.id,
      to: "manager_resolved",
      actorEmployeeId: params.actorId,
      detail: { action: "resolve_manual" },
    });
  } catch {
    return { ok: false, error: "This request was just resolved." };
  }
  const notifier = params.notifier ?? new LoggingNotificationService(supabase);
  await notifyReporter(notifier, req, "coverage_resolved_manually");
  return { ok: true };
}

/**
 * Who a manager can assign to: `eligible` (passes the normal checks) and `others`
 * (everyone else active — offered only behind an explicit eligibility override).
 */
export async function assignmentOptions(
  supabase: SupabaseClient,
  requestId: string,
): Promise<{ eligible: AssignOption[]; others: AssignOption[] }> {
  const req = await loadRequest(supabase, requestId);
  if (!req) return { eligible: [], others: [] };

  const eligible = await findCoverageCandidates(supabase, {
    shiftId: req.shift_id,
    reporterId: req.requested_by,
    sameLocationOnly: false,
  });
  const eligibleIds = new Set(eligible.map((e) => e.id));

  const { data: all } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("active", true)
    .neq("id", req.requested_by)
    .order("full_name");
  const others = (all ?? []).filter((e) => !eligibleIds.has(e.id));

  return { eligible, others };
}
