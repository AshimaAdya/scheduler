"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { strings } from "@/lib/strings";
import type { EligibleEmployee } from "@/lib/schedule/eligible";
import { getEligibleForShift, reassignShiftAction } from "./actions";

export type ShiftView = {
  id: string;
  timeLabel: string;
  skill: string;
  assigneeName: string | null;
};

export type DayColumn = {
  weekday: number;
  label: string;
  shifts: ShiftView[];
};

export function ScheduleGrid({ days }: { days: DayColumn[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ShiftView | null>(null);
  const [eligible, setEligible] = useState<EligibleEmployee[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function openShift(shift: ShiftView) {
    setSelected(shift);
    setEligible(null);
    setError(null);
    setLoading(true);
    const res = await getEligibleForShift(shift.id);
    setLoading(false);
    if (res.ok) setEligible(res.employees);
    else setError(res.error);
  }

  function assign(employeeId: string) {
    if (!selected) return;
    startTransition(async () => {
      const res = await reassignShiftAction(selected.id, employeeId);
      if (!res.ok) setError(res.error);
      else {
        setSelected(null);
        router.refresh();
      }
    });
  }

  return (
    <>
      <p className="text-sm text-faint">{strings.schedule.gridHint}</p>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {days.map((day) => (
          <div key={day.weekday} className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              {day.label}
            </p>
            {day.shifts.length === 0 ? (
              <p className="text-xs text-faint">—</p>
            ) : (
              day.shifts.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openShift(s)}
                  className={`rounded-control border p-2 text-left text-xs transition-colors ${
                    s.assigneeName
                      ? "border-line bg-surface hover:border-accent"
                      : "border-dashed border-danger/50 bg-danger-soft"
                  }`}
                >
                  <span className="block font-semibold text-ink">{s.timeLabel}</span>
                  <span className="block text-muted">{s.skill}</span>
                  <span
                    className={`block font-semibold ${
                      s.assigneeName ? "text-accent" : "text-danger"
                    }`}
                  >
                    {s.assigneeName ?? strings.schedule.unassigned}
                  </span>
                </button>
              ))
            )}
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setSelected(null)}
        >
          <Card
            className="w-full max-w-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between">
              <div>
                <p className="font-semibold text-ink">
                  {strings.schedule.reassignTitle}
                </p>
                <p className="text-sm text-muted">
                  {selected.timeLabel} · {selected.skill}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm text-muted"
              >
                {strings.schedule.close}
              </button>
            </div>

            {loading && (
              <p className="text-sm text-muted">
                {strings.schedule.loadingEligible}
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            {eligible && eligible.length === 0 && (
              <p className="text-sm text-muted">{strings.schedule.noEligible}</p>
            )}
            {eligible && eligible.length > 0 && (
              <ul className="flex flex-col gap-1">
                {eligible.map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => assign(e.id)}
                      disabled={pending}
                      className="w-full rounded-control px-3 py-2 text-left text-sm text-ink hover:bg-bg disabled:opacity-50"
                    >
                      {e.full_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
