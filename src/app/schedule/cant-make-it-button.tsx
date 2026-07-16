"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import { reportSickCallAction } from "./actions";

/** Two-tap "can't make it": tap once to arm, tap again to confirm (≤2 taps). */
export function CantMakeItButton({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await reportSickCallAction(shiftId);
      if (!res.ok) {
        setError(res.error);
        setArmed(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={armed ? "primary" : "danger"}
        size="sm"
        onClick={onClick}
        disabled={pending}
      >
        {pending
          ? "…"
          : armed
            ? strings.mySchedule.cantMakeItConfirm
            : strings.mySchedule.cantMakeIt}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
