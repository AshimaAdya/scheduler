/**
 * Employee-facing progress of a coverage request as a three-step journey —
 * your team → other locations → your manager — deliberately replacing the
 * internal "Tier 1/2" language on screen (Design direction v1). Pure, so it's
 * unit-tested and reused by the progress indicator.
 */
export type Journey = { step: 1 | 2 | 3; complete: boolean };

export function journeyStep(status: string): Journey | null {
  switch (status) {
    case "open":
    case "tier1_broadcast":
      return { step: 1, complete: false };
    case "tier2_broadcast":
      return { step: 2, complete: false };
    case "escalated":
      return { step: 3, complete: false };
    case "covered":
      return { step: 3, complete: true };
    default:
      return null; // cancelled / manager_resolved / anything terminal-without-journey
  }
}
