"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import type { IncomingSwap, OutgoingSwap, ShiftSummary } from "@/lib/coverage/swap";
import {
  acceptSwapAction,
  declineSwapAction,
  convertSwapToBroadcastAction,
} from "./actions";

function ShiftLine({ label, shift }: { label: string; shift: ShiftSummary }) {
  return (
    <p className="text-sm text-muted">
      <span className="text-faint">{label}: </span>
      <span className="text-ink">
        {shift.dateLabel} · {shift.timeLabel} · {shift.skill}
        {shift.locationName ? ` · ${shift.locationName}` : ""}
      </span>
    </p>
  );
}

/** B's inbox: incoming two-way swap proposals with accept / decline. */
export function SwapInbox({ incoming }: { incoming: IncomingSwap[] }) {
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
      {incoming.map((r) => (
        <Card key={r.requestId} className="flex flex-col gap-2 p-4">
          <p className="font-semibold text-ink">{r.requesterName}</p>
          <ShiftLine label={strings.mySchedule.youGive} shift={r.youGiveUp} />
          <ShiftLine label={strings.mySchedule.youGet} shift={r.youGet} />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => acceptSwapAction(r.requestId))}
            >
              {pending ? strings.mySchedule.accepting : strings.mySchedule.accept}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => run(() => declineSwapAction(r.requestId))}
            >
              {pending ? strings.mySchedule.declining : strings.mySchedule.decline}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

/** A's declined swaps: offer to broadcast the shift for cover instead. */
export function FellThroughList({ outgoing }: { outgoing: OutgoingSwap[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function broadcast(requestId: string) {
    setError(null);
    startTransition(async () => {
      const res = await convertSwapToBroadcastAction(requestId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p className="text-xs text-danger">{error}</p>}
      {outgoing.map((o) => (
        <Card
          key={o.requestId}
          className="flex items-center justify-between gap-3 border-dashed p-4"
        >
          <div>
            <p className="font-semibold text-ink">
              {o.shift.dateLabel} · {o.shift.timeLabel}
            </p>
            <p className="text-sm text-muted">
              {o.shift.skill}
              {o.shift.locationName ? ` · ${o.shift.locationName}` : ""}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => broadcast(o.requestId)}
          >
            {strings.mySchedule.broadcastInstead}
          </Button>
        </Card>
      ))}
    </div>
  );
}
