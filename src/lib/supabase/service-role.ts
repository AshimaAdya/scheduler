import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — BYPASSES RLS. Server-only (the `server-only`
 * import makes bundling it into client code a build error). Use exclusively for
 * privileged operations that must not be constrained by RLS: inviting users,
 * notification logging, cron tier advancement, atomic claim resolution.
 *
 * Never expose the service-role key or this client to the browser.
 */
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
