import Link from "next/link";
import { getCurrentRole, requireUser } from "@/lib/auth/session";
import { isManagerRole } from "@/lib/auth/guard";
import { SignOutButton } from "@/components/sign-out-button";

export default async function DashboardPage() {
  const user = await requireUser();
  const role = await getCurrentRole();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <SignOutButton />
      </div>
      <p className="text-sm text-gray-600">
        Signed in as <span className="font-medium">{user.email}</span> ({role})
      </p>
      {isManagerRole(role) && (
        <Link href="/manage" className="text-sm text-blue-600 underline">
          Go to manager area →
        </Link>
      )}
    </main>
  );
}
