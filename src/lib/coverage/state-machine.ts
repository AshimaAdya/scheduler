/**
 * The coverage-request state machine. This module defines the ONLY legal
 * transitions; `transition()` (transition.ts) is the ONLY place that writes
 * `coverage_requests.status`. Nothing else may mutate status.
 *
 *   open → tier1_broadcast → tier2_broadcast → escalated → covered
 *                                                        → cancelled
 *                                                        → manager_resolved
 *
 * A request can be covered from any active tier (someone accepts), and a manager
 * can cancel or manually resolve from any active state. Terminal states have no
 * outgoing transitions.
 */
export type CoverageStatus =
  | "open"
  | "tier1_broadcast"
  | "tier2_broadcast"
  | "escalated"
  | "covered"
  | "cancelled"
  | "manager_resolved";

export const ALLOWED_TRANSITIONS: Record<CoverageStatus, CoverageStatus[]> = {
  open: ["tier1_broadcast", "covered", "cancelled", "manager_resolved"],
  tier1_broadcast: ["tier2_broadcast", "covered", "cancelled", "manager_resolved"],
  tier2_broadcast: ["escalated", "covered", "cancelled", "manager_resolved"],
  escalated: ["covered", "cancelled", "manager_resolved"],
  covered: [],
  cancelled: [],
  manager_resolved: [],
};

export const TERMINAL_STATUSES: CoverageStatus[] = [
  "covered",
  "cancelled",
  "manager_resolved",
];

export function isTerminal(status: CoverageStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function isLegalTransition(
  from: CoverageStatus,
  to: CoverageStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: CoverageStatus,
    readonly to: CoverageStatus,
  ) {
    super(`Illegal coverage transition: ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertLegalTransition(
  from: CoverageStatus,
  to: CoverageStatus,
): void {
  if (!isLegalTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}
