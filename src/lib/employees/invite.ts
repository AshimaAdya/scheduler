import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Send a Supabase invite email to an employee and link the created auth user to
 * their employee record. Requires a service-role client (auth admin). Throws on
 * failure so callers can surface a message.
 */
export async function sendEmployeeInvite(
  admin: SupabaseClient,
  email: string,
  employeeId: string,
): Promise<string> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/confirm?next=/accept-invite`,
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to send invite.");
  }

  const { error: linkError } = await admin
    .from("employees")
    .update({ user_id: data.user.id })
    .eq("id", employeeId);
  if (linkError) throw new Error(linkError.message);

  return data.user.id;
}
