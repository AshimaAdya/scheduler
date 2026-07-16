import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="text-sm text-gray-600">
        Enter your work email and we&apos;ll send you a link to set a new
        password.
      </p>
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm text-blue-600 underline">
        Back to sign in
      </Link>
    </main>
  );
}
