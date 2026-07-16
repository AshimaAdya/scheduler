"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import { claimShiftAction } from "./actions";

export function ClaimButton({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function claim() {
    setError(null);
    startTransition(async () => {
      const res = await claimShiftAction(shiftId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={claim} disabled={pending}>
        {pending ? strings.mySchedule.claiming : strings.mySchedule.claim}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
