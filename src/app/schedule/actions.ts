"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeId, requireUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { claimShift, type ClaimResult } from "@/lib/schedule/claim";
import { reportSickCall } from "@/lib/coverage/sick-call";

export type SickCallActionResult = { ok: true } | { ok: false; error: string };

export async function reportSickCallAction(
  shiftId: string,
): Promise<SickCallActionResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };
  if (!shiftId) return { ok: false, error: "Missing shift." };

  // Authorized (own shift, verified inside reportSickCall); flow runs service-role.
  const admin = createServiceRoleClient();
  const res = await reportSickCall(admin, {
    shiftId,
    reporterEmployeeId: employeeId,
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
