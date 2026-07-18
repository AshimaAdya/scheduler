"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import type { SwapCandidate, ShiftSummary } from "@/lib/coverage/swap";
import {
  swapCandidatesAction,
  tradeableShiftsAction,
  proposeSwapAction,
} from "./actions";

/**
 * Two-way swap proposer (invariant #3): step 1 pick a coworker eligible for this
 * shift (name only), step 2 pick one of their shifts you're eligible to take,
 * then propose. All disclosure comes from authorized server actions.
 */
export function SwapProposer({ shiftId }: { shiftId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null);
  const [target, setTarget] = useState<SwapCandidate | null>(null);
  const [shifts, setShifts] = useState<ShiftSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setCandidates(null);
    setTarget(null);
    setShifts(null);
    setError(null);
  }

  function start() {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      const res = await swapCandidatesAction(shiftId);
      if (!res.ok) setError(res.error);
      else setCandidates(res.candidates);
    });
  }

  function pickCoworker(c: SwapCandidate) {
    setTarget(c);
    setError(null);
    startTransition(async () => {
      const res = await tradeableShiftsAction(shiftId, c.id);
      if (!res.ok) setError(res.error);
      else setShifts(res.shifts);
    });
  }

  function propose(offeredShiftId: string) {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const res = await proposeSwapAction(shiftId, target.id, offeredShiftId);
      if (!res.ok) {
        setError(res.error);
      } else {
        reset();
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={start}>
        {strings.mySchedule.swap}
      </Button>
    );
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-2 rounded-card border border-line p-3">
      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Step 2: pick one of the chosen coworker's shifts. */}
      {target ? (
        <>
          <p className="text-xs font-semibold text-muted">
            {strings.mySchedule.pickTheirShift}
          </p>
          {shifts === null ? (
            <p className="text-xs text-faint">…</p>
          ) : shifts.length === 0 ? (
            <p className="text-xs text-muted">{strings.mySchedule.noTradeable}</p>
          ) : (
            shifts.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => propose(s.id)}
                className="rounded-card border border-line px-3 py-2 text-left text-sm hover:bg-bg disabled:opacity-50"
              >
                <span className="font-semibold text-ink">
                  {s.dateLabel} · {s.timeLabel}
                </span>
                <span className="text-muted">
                  {" "}
                  · {s.skill}
                  {s.locationName ? ` · ${s.locationName}` : ""}
                </span>
              </button>
            ))
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTarget(null);
                setShifts(null);
              }}
            >
              {strings.mySchedule.back}
            </Button>
          </div>
        </>
      ) : (
        /* Step 1: pick a coworker. */
        <>
          <p className="text-xs font-semibold text-muted">
            {strings.mySchedule.pickCoworker}
          </p>
          {candidates === null ? (
            <p className="text-xs text-faint">…</p>
          ) : candidates.length === 0 ? (
            <p className="text-xs text-muted">{strings.mySchedule.noCandidates}</p>
          ) : (
            candidates.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => pickCoworker(c)}
                className="rounded-card border border-line px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-bg disabled:opacity-50"
              >
                {c.full_name}
              </button>
            ))
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={reset}>
              {strings.common.cancel}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
