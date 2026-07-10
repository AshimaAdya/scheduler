import Link from "next/link";
import { InviteForm } from "./invite-form";

export default function ManagePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Manager area</h1>
        <Link href="/dashboard" className="text-sm text-blue-600 underline">
          ← Dashboard
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Invite an employee</h2>
        <p className="text-sm text-gray-600">
          Sends an email invite to an existing employee so they can set a
          password and sign in.
        </p>
        <InviteForm />
      </section>
    </main>
  );
}
