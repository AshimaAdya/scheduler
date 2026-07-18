"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import {
  reportSickCallAction,
  requestDayOffAction,
  type CoverageActionResult,
} from "./actions";
import { SwapProposer } from "./swap-proposer";

type Variant = "primary" | "secondary" | "danger";

/** A single action that arms on first tap and fires on the second (≤2 taps). */
function TwoTapButton({
  label,
  confirmLabel,
  variant,
  run,
}: {
  label: string;
  confirmLabel: string;
  variant: Variant;
  run: () => Promise<CoverageActionResult>;
}) {
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
      const res = await run();
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
        variant={armed ? "primary" : variant}
        size="sm"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "…" : armed ? confirmLabel : label}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

export function ShiftActions({ shiftId }: { shiftId: string }) {
  return (
    <div className="flex flex-col items-end gap-2">
      <TwoTapButton
        label={strings.mySchedule.cantMakeIt}
        confirmLabel={strings.mySchedule.cantMakeItConfirm}
        variant="danger"
        run={() => reportSickCallAction(shiftId)}
      />
      <TwoTapButton
        label={strings.mySchedule.dayOff}
        confirmLabel={strings.mySchedule.dayOffConfirm}
        variant="secondary"
        run={() => requestDayOffAction(shiftId)}
      />
      <SwapProposer shiftId={shiftId} />
    </div>
  );
}
