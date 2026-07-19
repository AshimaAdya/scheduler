"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { strings } from "@/lib/strings";
import { updateMyNotifyPref } from "./actions";

const OPTIONS = ["both", "sms", "email"] as const;

/** How the employee wants to be reached — saved immediately on change. */
export function NotifyPrefControl({ initial }: { initial: string }) {
  const router = useRouter();
  const [pref, setPref] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: string) {
    const previous = pref;
    setPref(next);
    setError(null);
    start(async () => {
      const res = await updateMyNotifyPref(next);
      if (!res.ok) {
        setPref(previous);
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={pending}
            onClick={() => choose(opt)}
            aria-pressed={pref === opt}
            className={`flex-1 rounded-control border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
              pref === opt
                ? "border-accent bg-accent-soft text-accent"
                : "border-line text-muted"
            }`}
          >
            {strings.settings.channels[opt]}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
