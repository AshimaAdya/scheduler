"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeId, requireUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { claimShift, type ClaimResult } from "@/lib/schedule/claim";
import { reportSickCall } from "@/lib/coverage/sick-call";
import { requestDayOff } from "@/lib/coverage/day-off";
import {
  swapCandidates,
  tradeableShifts,
  proposeSwap,
  acceptSwap,
  declineSwap,
  convertSwapToBroadcast,
  type SwapCandidate,
  type ShiftSummary,
} from "@/lib/coverage/swap";

export type CoverageActionResult = { ok: true } | { ok: false; error: string };

export async function reportSickCallAction(
  shiftId: string,
): Promise<CoverageActionResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };
  if (!shiftId) return { ok: false, error: "Missing shift." };

  // Authorized (own shift, verified inside); flow runs service-role.
  const admin = createServiceRoleClient();
  const res = await reportSickCall(admin, {
    shiftId,
    reporterEmployeeId: employeeId,
  });

  revalidatePath("/schedule");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function requestDayOffAction(
  shiftId: string,
): Promise<CoverageActionResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };
  if (!shiftId) return { ok: false, error: "Missing shift." };

  const admin = createServiceRoleClient();
  const res = await requestDayOff(admin, {
    shiftId,
    reporterEmployeeId: employeeId,
  });

  revalidatePath("/schedule");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** Verify the caller owns the shift before disclosing swap options for it. */
async function requireShiftOwner(
  admin: ReturnType<typeof createServiceRoleClient>,
  shiftId: string,
  employeeId: string,
): Promise<boolean> {
  const { data } = await admin
    .from("shift_assignments")
    .select("id")
    .eq("shift_id", shiftId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  return !!data;
}

export async function swapCandidatesAction(
  shiftId: string,
): Promise<{ ok: true; candidates: SwapCandidate[] } | { ok: false; error: string }> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };

  const admin = createServiceRoleClient();
  if (!(await requireShiftOwner(admin, shiftId, employeeId))) {
    return { ok: false, error: "That shift isn't yours." };
  }
  const candidates = await swapCandidates(admin, { shiftId, aEmployeeId: employeeId });
  return { ok: true, candidates };
}

export async function tradeableShiftsAction(
  shiftId: string,
  targetEmployeeId: string,
): Promise<{ ok: true; shifts: ShiftSummary[] } | { ok: false; error: string }> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };

  const admin = createServiceRoleClient();
  if (!(await requireShiftOwner(admin, shiftId, employeeId))) {
    return { ok: false, error: "That shift isn't yours." };
  }
  const shifts = await tradeableShifts(admin, {
    aEmployeeId: employeeId,
    aShiftId: shiftId,
    targetEmployeeId,
  });
  return { ok: true, shifts };
}

export async function proposeSwapAction(
  shiftId: string,
  targetEmployeeId: string,
  offeredShiftId: string,
): Promise<CoverageActionResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };

  const admin = createServiceRoleClient();
  const res = await proposeSwap(admin, {
    aEmployeeId: employeeId,
    aShiftId: shiftId,
    targetEmployeeId,
    offeredShiftId,
  });

  revalidatePath("/schedule");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function acceptSwapAction(requestId: string): Promise<CoverageActionResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };

  const admin = createServiceRoleClient();
  const res = await acceptSwap(admin, { requestId, actorEmployeeId: employeeId });

  revalidatePath("/schedule");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function declineSwapAction(requestId: string): Promise<CoverageActionResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };

  const admin = createServiceRoleClient();
  const res = await declineSwap(admin, { requestId, actorEmployeeId: employeeId });

  revalidatePath("/schedule");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function convertSwapToBroadcastAction(
  requestId: string,
): Promise<CoverageActionResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };

  const admin = createServiceRoleClient();
  const res = await convertSwapToBroadcast(admin, {
    requestId,
    actorEmployeeId: employeeId,
  });

  revalidatePath("/schedule");
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function claimShiftAction(shiftId: string): Promise<ClaimResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };
  if (!shiftId) return { ok: false, error: "Missing shift." };

  // Authorized (own claim); the claim itself is atomic and runs as service-role.
  const admin = createServiceRoleClient();
  const result = await claimShift(admin, { shiftId, employeeId });

  revalidatePath("/schedule");
  return result;
}
