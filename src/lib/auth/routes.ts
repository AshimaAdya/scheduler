/**
 * Pure route classification for auth gating. No framework imports — safe to unit
 * test and to import from both the proxy (edge/node) and Server Components.
 *
 * Convention: manager/admin-only pages live under `/manage`. Employee pages live
 * at the top level (e.g. `/dashboard`, `/availability`).
 */
export type AppRole = "employee" | "manager" | "admin";

/** Routes reachable without authentication. */
const PUBLIC_PREFIXES = ["/login", "/accept-invite", "/auth"];

/** Manager/admin-only area. */
const MANAGER_PREFIXES = ["/manage"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function isPublicRoute(pathname: string): boolean {
  return matches(pathname, PUBLIC_PREFIXES);
}

export function isManagerRoute(pathname: string): boolean {
  return matches(pathname, MANAGER_PREFIXES);
}
