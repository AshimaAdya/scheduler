import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { redirectTargetFor } from "@/lib/auth/guard";
import type { AppRole } from "@/lib/auth/routes";

/**
 * Next.js 16 Proxy (formerly `middleware`). Refreshes the Supabase auth session
 * on every request and gates access using the shared pure guard logic:
 *   - unauthenticated on a protected route → /login (with `next` preserved)
 *   - wrong role on a manager route        → /dashboard
 *
 * Page-level guards (requireUser / requireManager) re-check server-side as
 * defense in depth; this proxy is the first line and the session refresher.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() authenticates against the auth server (do not trust getSession here).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let role: AppRole | null = null;
  if (user) {
    const { data } = await supabase.auth.getClaims();
    role = (data?.claims?.user_role as AppRole | undefined) ?? null;
  }

  const target = redirectTargetFor(role, request.nextUrl.pathname);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    if (target === "/login") {
      url.searchParams.set("next", request.nextUrl.pathname);
    }
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except static assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
