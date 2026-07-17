"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeId, requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { approveDayOff, type ApproveResult } from "@/lib/coverage/day-off";

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
