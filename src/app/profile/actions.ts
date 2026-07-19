"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeId, requireUser } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { NotificationChannelPref } from "@/lib/settings/types";

export type ProfileResult = { ok: true } | { ok: false; error: string };

const PREFS: NotificationChannelPref[] = ["email", "sms", "both"];

/**
 * An employee updates their own contact preference. Employees have no write
 * access to the employees table under RLS, so this runs service-role — scoped
 * strictly to the caller's own id.
 */
export async function updateMyNotifyPref(pref: string): Promise<ProfileResult> {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) return { ok: false, error: "No employee profile." };
  if (!(PREFS as string[]).includes(pref)) {
    return { ok: false, error: "Invalid preference." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("employees")
    .update({ notify_pref: pref })
    .eq("id", employeeId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/profile");
  return { ok: true };
}
