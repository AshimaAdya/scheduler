/**
 * Pure role-gating logic. This is the route-guard utility (SCH-8 AC3): given a
 * role (or null for unauthenticated) and a path, decide access and where to
 * redirect. Framework-free and fully unit tested; the proxy and Server
 * Components delegate their decisions here so gating is defined in exactly one
 * place.
 */
import type { AppRole } from "./routes";
import { isManagerRoute, isPublicRoute } from "./routes";

/** Managers and admins both have manager-level access. */
export function isManagerRole(role: AppRole | null | undefined): boolean {
  return role === "manager" || role === "admin";
}

/** Can a user with `role` (null = unauthenticated) view `pathname`? */
export function canAccessRoute(
  role: AppRole | null | undefined,
  pathname: string,
): boolean {
  if (isPublicRoute(pathname)) return true;
  if (!role) return false; // authentication required
  if (isManagerRoute(pathname)) return isManagerRole(role);
  return true; // any authenticated role
}

/**
 * Where to send a user who cannot access `pathname`, or null if they can.
 *   - unauthenticated → /login
 *   - authenticated but wrong role → /dashboard
 */
export function redirectTargetFor(
  role: AppRole | null | undefined,
  pathname: string,
): string | null {
  if (canAccessRoute(role, pathname)) return null;
  return role ? "/dashboard" : "/login";
}
