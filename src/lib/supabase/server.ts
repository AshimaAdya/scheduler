import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for Server Components, Route Handlers, and Server Actions.
 * Wired to Next's cookie store so the auth session is read and refreshed. Uses
 * the anon key — RLS applies, scoped to the signed-in user.
 *
 * `cookies()` is async in Next 16, so this factory is async too.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In Server Components the cookie store is read-only; those writes are
          // safely ignored because the proxy refreshes the session cookie. In
          // Route Handlers / Server Actions this persists the refreshed session.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component render — ignore.
          }
        },
      },
    },
  );
}
