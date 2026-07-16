import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertLegalTransition,
  type CoverageStatus,
} from "./state-machine";

export type TransitionParams = {
  requestId: string;
  to: CoverageStatus;
  actorEmployeeId?: string | null;
  /** Extra context stored on the audit row. */
  detail?: Record<string, unknown>;
  /**
   * Extra columns written atomically WITH the status change (e.g. `covered_by`,
   * `tier_expires_at`). This is how status-adjacent fields stay consistent with
   * the state — they must never be written by a separate query.
   */
  patch?: Record<string, unknown>;
};

export class TransitionConflictError extends Error {
  constructor(readonly requestId: string) {
    super(`Coverage request ${requestId} changed concurrently; transition aborted.`);
    this.name = "TransitionConflictError";
  }
}

/**
 * The SINGLE place that mutates `coverage_requests.status`. It:
 *  1. reads the current status,
 *  2. asserts the transition is legal (throws IllegalTransitionError otherwise),
 *  3. applies the change with a compare-and-swap guard (`status = from`) so two
 *     concurrent transitions can't both apply, and
 *  4. writes a `coverage_audit_log` row.
 *
 * Timestamps `covered_at` / `resolved_at` are set as part of the same write.
 * (Note: the DB CHECK requires `covered_by` when moving to 'covered', so callers
 * moving to 'covered' must pass it in `patch`.)
 */
export async function transition(
  supabase: SupabaseClient,
  params: TransitionParams,
): Promise<CoverageStatus> {
  const { data: current, error: readError } = await supabase
    .from("coverage_requests")
    .select("status")
    .eq("id", params.requestId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current) throw new Error(`Coverage request ${params.requestId} not found.`);

  const from = current.status as CoverageStatus;
  assertLegalTransition(from, params.to);

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: params.to,
    ...(params.patch ?? {}),
  };
  if (params.to === "covered") patch.covered_at = now;
  if (params.to === "cancelled" || params.to === "manager_resolved") {
    patch.resolved_at = now;
  }

  // Compare-and-swap: only apply if the status is still `from`.
  const { data: updated, error: updateError } = await supabase
    .from("coverage_requests")
    .update(patch)
    .eq("id", params.requestId)
    .eq("status", from)
    .select("id");
  if (updateError) throw new Error(updateError.message);
  if (!updated || updated.length === 0) {
    throw new TransitionConflictError(params.requestId);
  }

  const { error: auditError } = await supabase.from("coverage_audit_log").insert({
    coverage_request_id: params.requestId,
    from_status: from,
    to_status: params.to,
    actor_employee_id: params.actorEmployeeId ?? null,
    detail: params.detail ?? null,
  });
  if (auditError) throw new Error(auditError.message);

  return params.to;
}
