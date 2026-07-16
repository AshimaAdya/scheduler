"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appUrl}/auth/confirm?next=/reset-password`,
    });

    // Always show the same confirmation — never reveal whether an email exists.
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <p className="text-sm text-gray-600">
        If an account exists for <span className="font-medium">{email}</span>,
        we&apos;ve sent a link to reset your password. Check your email.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Work email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
          autoComplete="email"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
