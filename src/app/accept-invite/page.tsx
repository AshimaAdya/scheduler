import { Suspense } from "react";
import { AcceptInviteForm } from "./accept-invite-form";

export default function AcceptInvitePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Set your password</h1>
      <p className="text-sm text-gray-600">
        Choose a password to finish setting up your account.
      </p>
      <Suspense>
        <AcceptInviteForm />
      </Suspense>
    </main>
  );
}
