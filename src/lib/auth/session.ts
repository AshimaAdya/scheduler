import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isManagerRole } from "./guard";
import type { AppRole } from "./routes";

/** The authenticated auth user, or null. Verified against the auth server. */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** The current user's linked employee id, or null. */
export async function getCurrentEmployeeId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * The current user's role. Prefers the `user_role` JWT claim (from the custom
 * access token hook); falls back to the employees table if the claim is absent.
 */
export async function getCurrentRole(): Promise<AppRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: claimsData } = await supabase.auth.getClaims();
  const claimRole = claimsData?.claims?.user_role as AppRole | undefined;
  if (claimRole) return claimRole;

  const { data: emp } = await supabase
    .from("employees")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  return (emp?.role as AppRole | undefined) ?? null;
}

/** Require an authenticated user; redirect to /login otherwise. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require manager/admin; redirect employees to /dashboard, guests to /login. */
export async function requireManager(): Promise<AppRole> {
  const role = await getCurrentRole();
  if (!role) redirect("/login");
  if (!isManagerRole(role)) redirect("/dashboard");
  return role;
}
