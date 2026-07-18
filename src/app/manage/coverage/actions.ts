"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeId, requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { approveDayOff, type ApproveResult } from "@/lib/coverage/day-off";
import { confirmSwap } from "@/lib/coverage/swap";

type ActionResult = { ok: true } | { ok: false; error: string };

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
