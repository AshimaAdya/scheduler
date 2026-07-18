"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import type { CoverageAsk } from "@/lib/coverage/respond";
import { acceptCoverageOfferAction, declineCoverageOfferAction } from "./actions";

/** Shifts the employee is asked to cover, with "Yes, I'll cover" / "Can't". */
export function CoverageAsks({ asks }: { asks: CoverageAsk[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? strings.mySchedule.reportError);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      {asks.map((a) => {
        const triggerLabel =
          strings.coverage.triggers[a.trigger as keyof typeof strings.coverage.triggers] ??
          a.trigger;
        return (
          <Card key={a.requestId} className="flex flex-col gap-2 p-4">
            <div>
              <p className="font-semibold text-ink">
                {a.shift.dateLabel} · {a.shift.timeLabel}
              </p>
              <p className="text-sm text-muted">
                {a.shift.skill}
                {a.shift.locationName ? ` · ${a.shift.locationName}` : ""} · {a.reporterName}{" "}
                <span className="text-faint">({triggerLabel})</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pending}
                onClick={() => run(() => acceptCoverageOfferAction(a.requestId))}
              >
                {pending ? strings.mySchedule.covering : strings.mySchedule.coverIt}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() => run(() => declineCoverageOfferAction(a.requestId))}
              >
                {strings.mySchedule.cantCover}
              </Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
