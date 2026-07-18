"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { strings } from "@/lib/strings";
import type { AssignOption } from "@/lib/coverage/overrides";
import {
  assignmentOptionsAction,
  managerAssignAction,
  cancelRequestAction,
  forceApproveUncoveredAction,
  resolveManuallyAction,
} from "./actions";

type Options = { eligible: AssignOption[]; others: AssignOption[] };

/**
 * Manager override controls for an active coverage request (SCH-24). A manager
 * can assign someone directly, cancel, approve-uncovered, or resolve manually —
 * always available while the request is unresolved.
 */
export function OverridePanel({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [options, setOptions] = useState<Options | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await action();
      if (!res.ok) setError(res.error ?? strings.mySchedule.reportError);
      else router.refresh();
    });
  }

  // A two-tap confirm for the consequential single-step actions.
  function confirmable(key: string, label: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    const isArmed = armed === key;
    return (
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!isArmed) {
            setArmed(key);
            return;
          }
          setArmed(null);
          run(action);
        }}
      >
        {isArmed ? strings.coverage.confirm : label}
      </Button>
    );
  }

  function openPicker() {
    setPicking(true);
    setError(null);
    start(async () => {
      setOptions(await assignmentOptionsAction(requestId));
    });
  }

  function assign(id: string, override: boolean) {
    run(() => managerAssignAction(requestId, id, override));
  }

  return (
    <div className="mt-2 flex w-full flex-col gap-2 rounded-card border border-line p-3">
      <p className="text-xs font-semibold text-muted">{strings.coverage.override}</p>
      {error && <p className="text-xs text-danger">{error}</p>}

      {picking ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-muted">
            {strings.coverage.chooseAssignee}
          </p>
          {options === null ? (
            <p className="text-xs text-faint">…</p>
          ) : (
            <>
              {options.eligible.length === 0 && !showOthers && (
                <p className="text-xs text-muted">{strings.coverage.noneToAssign}</p>
              )}
              {options.eligible.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  disabled={pending}
                  onClick={() => assign(e.id, false)}
                  className="rounded-card border border-line px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-bg disabled:opacity-50"
                >
                  {e.full_name}
                </button>
              ))}

              {showOthers ? (
                options.others.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    disabled={pending}
                    onClick={() => assign(e.id, true)}
                    className="flex items-center justify-between rounded-card border border-danger/40 px-3 py-2 text-left text-sm text-ink hover:bg-danger-soft disabled:opacity-50"
                  >
                    <span className="font-semibold">{e.full_name}</span>
                    <Chip tone="danger">{strings.coverage.overrideBadge}</Chip>
                  </button>
                ))
              ) : (
                <button
                  type="button"
                  onClick={() => setShowOthers(true)}
                  className="text-left text-xs text-muted underline"
                >
                  {strings.coverage.overrideToggle}
                </button>
              )}

              <Button variant="secondary" size="sm" onClick={() => setPicking(false)}>
                {strings.coverage.close}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={pending} onClick={openPicker}>
            {strings.coverage.assignDirectly}
          </Button>
          {confirmable("cancel", strings.coverage.cancelSearch, () =>
            cancelRequestAction(requestId),
          )}
          {confirmable("uncovered", strings.coverage.leaveUnfilled, () =>
            forceApproveUncoveredAction(requestId),
          )}
          {confirmable("resolve", strings.coverage.markHandled, () =>
            resolveManuallyAction(requestId),
          )}
        </div>
      )}
    </div>
  );
}
