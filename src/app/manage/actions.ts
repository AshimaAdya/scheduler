"use server";

import { requireManager } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type InviteResult = { ok: true } | { ok: false; error: string };

/**
 * Invite an existing employee to the app: sends a Supabase invite email and
 * links the created auth user to the employee record. Manager/admin only.
 *
 * (Creating the employee record itself is SCH-9; this action invites one that
 * already exists.)
 */
export async function inviteEmployee(
  _prev: InviteResult | null,
  formData: FormData,
): Promise<InviteResult> {
  await requireManager();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email) return { ok: false, error: "Email is required." };

  const admin = createServiceRoleClient();

  const { data: employee } = await admin
    .from("employees")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!employee) {
    return { ok: false, error: "No employee found with that email." };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/confirm?next=/accept-invite`,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Failed to send invite." };
  }

  const { error: linkError } = await admin
    .from("employees")
    .update({ user_id: data.user.id })
    .eq("id", employee.id);
  if (linkError) {
    return { ok: false, error: linkError.message };
  }

  return { ok: true };
}
