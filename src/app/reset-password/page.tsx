import { SetPasswordForm } from "@/components/set-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="text-sm text-gray-600">
        Enter a new password for your account.
      </p>
      <SetPasswordForm submitLabel="Update password" redirectTo="/dashboard" />
    </main>
  );
}
