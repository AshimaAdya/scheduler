"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import { approveDayOffAction } from "./actions";

export function ApproveDayOffButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function approve() {
    setError(null);
    startTransition(async () => {
      const res = await approveDayOffAction(requestId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={approve} disabled={pending}>
        {pending ? strings.coverage.approving : strings.coverage.approve}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
