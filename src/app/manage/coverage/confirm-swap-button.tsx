"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import { confirmSwapAction } from "./actions";

export function ConfirmSwapButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const res = await confirmSwapAction(requestId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={confirm} disabled={pending}>
        {pending ? strings.coverage.confirmingSwap : strings.coverage.confirmSwap}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
