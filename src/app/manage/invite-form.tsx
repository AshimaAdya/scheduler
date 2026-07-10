"use client";

import { useActionState } from "react";
import { inviteEmployee, type InviteResult } from "./actions";

export function InviteForm() {
  const [result, action, pending] = useActionState<InviteResult | null, FormData>(
    inviteEmployee,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Employee email
        <input
          type="email"
          name="email"
          required
          className="rounded border border-gray-300 px-3 py-2"
          placeholder="employee@harbourcoffee.test"
        />
      </label>
      {result?.ok === true && (
        <p className="text-sm text-green-700">Invite sent.</p>
      )}
      {result?.ok === false && (
        <p className="text-sm text-red-600">{result.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send invite"}
      </button>
    </form>
  );
}
