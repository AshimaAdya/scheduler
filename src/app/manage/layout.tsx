import { requireManager } from "@/lib/auth/session";

/**
 * Server-side gate for the entire /manage area. Employees are redirected to
 * /dashboard, guests to /login — defense in depth alongside the proxy.
 */
export default async function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireManager();
  return <>{children}</>;
}
