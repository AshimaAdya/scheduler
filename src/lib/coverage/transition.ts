import type { SupabaseClient } from "@supabase/supabase-js";
import { IllegalTransitionError, type CoverageStatus } from "./state-machine";

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
 * The single entry point for mutating `coverage_requests.status`. It delegates to
 * the `coverage_transition` SQL function (migration 20260716130000), which is the
 * CANONICAL sole writer of status: it reads the current status, asserts the
 * transition is legal, applies a compare-and-swap (`status = from`), stamps
 * `covered_at`/`resolved_at`, and appends a `coverage_audit_log` row — all in one
 * transaction. Lifting this into SQL means the atomic swap path (`accept_swap`)
 * can flip a request to 'covered' through the SAME logic from inside its own
 * transaction, so the single-writer invariant holds at the DB level.
 *
 * `patch` carries status-adjacent columns written atomically WITH the status. The
 * SQL side honours a bounded allow-list (`covered_by`, `tier_expires_at`); adding
 * a new key means adding it to the function too.
 *
 * (Note: the DB CHECK requires `covered_by` when moving to 'covered', so callers
 * moving to 'covered' must pass it in `patch`.)
 */
export async function transition(
  supabase: SupabaseClient,
  params: TransitionParams,
): Promise<CoverageStatus> {
  // Read the observed `from` (also surfaces "not found"); the SQL function checks
  // legality against it and compare-and-swaps on it — so two racing transitions
  // still resolve to exactly one winner (the loser gets a transition_conflict).
  const { data: current, error: readError } = await supabase
    .from("coverage_requests")
    .select("status")
    .eq("id", params.requestId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current) throw new Error(`Coverage request ${params.requestId} not found.`);

  const { error } = await supabase.rpc("coverage_transition", {
    p_request_id: params.requestId,
    p_from: current.status as CoverageStatus,
    p_to: params.to,
    p_actor: params.actorEmployeeId ?? null,
    p_detail: params.detail ?? null,
    p_patch: params.patch ?? null,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("transition_conflict")) {
      throw new TransitionConflictError(params.requestId);
    }
    if (message.includes("illegal_transition")) {
      // Message shape: "illegal_transition:<from>:<to>".
      const from = (message.split(":")[1] ?? "unknown") as CoverageStatus;
      throw new IllegalTransitionError(from, params.to);
    }
    throw new Error(message || "Coverage transition failed.");
  }

  return params.to;
}
