"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeId, requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { approveDayOff, type ApproveResult } from "@/lib/coverage/day-off";
import { confirmSwap } from "@/lib/coverage/swap";
import {
  managerAssign,
  cancelRequest,
  forceApproveUncovered,
  resolveManually,
  assignmentOptions,
  type OverrideResult,
  type AssignOption,
} from "@/lib/coverage/overrides";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Authorize the caller as a manager and return the service-role client + actor. */
async function managerContext() {
  await requireManager();
  const actorId = await getCurrentEmployeeId();
  return { admin: createServiceRoleClient(), actorId };
}

/**
 * Manager confirms a covered day-off (require_approval mode). RLS lets managers
 * update coverage_requests, and the DB CHECK guarantees approval is impossible
 * unless the request is covered.
 */
export async function approveDayOffAction(
  requestId: string,
): Promise<ApproveResult> {
  await requireManager();
  const actorEmployeeId = await getCurrentEmployeeId();
  if (!requestId) return { ok: false, error: "Missing request." };

  const supabase = await createClient();
  const res = await approveDayOff(supabase, { requestId, actorEmployeeId });

  revalidatePath("/manage/coverage");
  return res;
}

/**
 * Manager confirms an accepted two-way swap (require_approval mode) by clearing
 * pending_approval on both swapped assignments. RLS lets managers update
 * shift_assignments.
 */
export async function confirmSwapAction(requestId: string): Promise<ActionResult> {
  await requireManager();
  if (!requestId) return { ok: false, error: "Missing request." };

  const supabase = await createClient();
  const res = await confirmSwap(supabase, { requestId });

  revalidatePath("/manage/coverage");
  return res;
}

// ── Manager overrides (SCH-24) — a manager can always intervene ────────────────

export async function assignmentOptionsAction(
  requestId: string,
): Promise<{ eligible: AssignOption[]; others: AssignOption[] }> {
  const { admin } = await managerContext();
  return assignmentOptions(admin, requestId);
}

export async function managerAssignAction(
  requestId: string,
  assigneeId: string,
  overrideEligibility: boolean,
): Promise<OverrideResult> {
  const { admin, actorId } = await managerContext();
  if (!actorId) return { ok: false, error: "No manager profile." };
  const res = await managerAssign(admin, {
    requestId,
    assigneeId,
    actorId,
    overrideEligibility,
  });
  revalidatePath("/manage/coverage");
  return res;
}

export async function cancelRequestAction(requestId: string): Promise<OverrideResult> {
  const { admin, actorId } = await managerContext();
  if (!actorId) return { ok: false, error: "No manager profile." };
  const res = await cancelRequest(admin, { requestId, actorId });
  revalidatePath("/manage/coverage");
  return res;
}

export async function forceApproveUncoveredAction(
  requestId: string,
): Promise<OverrideResult> {
  const { admin, actorId } = await managerContext();
  if (!actorId) return { ok: false, error: "No manager profile." };
  const res = await forceApproveUncovered(admin, { requestId, actorId });
  revalidatePath("/manage/coverage");
  return res;
}

export async function resolveManuallyAction(requestId: string): Promise<OverrideResult> {
  const { admin, actorId } = await managerContext();
  if (!actorId) return { ok: false, error: "No manager profile." };
  const res = await resolveManually(admin, { requestId, actorId });
  revalidatePath("/manage/coverage");
  return res;
}
