"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { strings } from "@/lib/strings";
import { validateWeeklyAvailability } from "@/lib/availability/validate";
import type {
  EmployeeAvailability,
  RecurringRule,
  ExceptionRule,
} from "@/lib/availability/queries";
import {
  saveRecurringAvailability,
  addException,
  removeException,
} from "@/app/availability/actions";

// Display order: Monday first (the business week starts Monday), value is 0=Sun..6=Sat.
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

type Row = { key: string; weekday: number; start: string; end: string };

let counter = 0;
const newKey = () => `r${counter++}`;

function toRows(recurring: RecurringRule[]): Row[] {
  return recurring.map((r) => ({
    key: newKey(),
    weekday: r.weekday,
    start: r.start,
    end: r.end,
  }));
}

export function AvailabilityEditor({
  employeeId,
  initial,
}: {
  employeeId: string;
  initial: EmployeeAvailability;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() => toRows(initial.recurring));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();

  function addRow(weekday: number) {
    setSaved(false);
    setRows((rs) => [...rs, { key: newKey(), weekday, start: "09:00", end: "17:00" }]);
  }
  function updateRow(key: string, patch: Partial<Row>) {
    setSaved(false);
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function removeRow(key: string) {
    setSaved(false);
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  function save() {
    setError(null);
    const ranges = rows.map(({ weekday, start, end }) => ({ weekday, start, end }));
    const validation = validateWeeklyAvailability(ranges);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    startSaving(async () => {
      const res = await saveRecurringAvailability(employeeId, ranges);
      if (!res.ok) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        {WEEKDAYS.map((day) => {
          const dayRows = rows.filter((r) => r.weekday === day.value);
          return (
            <div
              key={day.value}
              className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 last:pb-0"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{day.label}</span>
                <button
                  type="button"
                  onClick={() => addRow(day.value)}
                  className="text-sm font-semibold text-accent"
                >
                  {strings.availability.addRange}
                </button>
              </div>
              {dayRows.length === 0 ? (
                <span className="text-sm text-faint">
                  {strings.availability.notAvailable}
                </span>
              ) : (
                dayRows.map((r) => (
                  <div key={r.key} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) => updateRow(r.key, { start: e.target.value })}
                      className="rounded-control border border-line bg-surface px-2 py-1 text-sm"
                    />
                    <span className="text-muted">–</span>
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => updateRow(r.key, { end: e.target.value })}
                      className="rounded-control border border-line bg-surface px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(r.key)}
                      className="text-sm text-danger"
                      aria-label="Remove"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          );
        })}

        {error && <p className="text-sm text-danger">{error}</p>}
        {saved && <p className="text-sm text-ok">{strings.availability.saved}</p>}
        <div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : strings.availability.save}
          </Button>
        </div>
      </Card>

      <ExceptionsSection
        employeeId={employeeId}
        exceptions={initial.exceptions}
      />

      <p className="text-sm text-faint">{strings.availability.footnote}</p>
    </div>
  );
}

function ExceptionsSection({
  employeeId,
  exceptions,
}: {
  employeeId: string;
  exceptions: ExceptionRule[];
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startPending] = useTransition();

  function add() {
    setError(null);
    if (!date) return;
    startPending(async () => {
      const res = await addException(employeeId, date);
      if (!res.ok) setError(res.error);
      else {
        setDate("");
        router.refresh();
      }
    });
  }
  function remove(id: string) {
    startPending(async () => {
      const res = await removeException(employeeId, id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="font-semibold text-ink">{strings.availability.awayTitle}</h2>
        <p className="text-sm text-muted">{strings.availability.awayHint}</p>
      </div>

      {exceptions.length > 0 && (
        <ul className="flex flex-col gap-2">
          {exceptions.map((ex) => (
            <li key={ex.id} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm text-ink">
                {ex.date}
                <Chip tone="warn">{strings.availability.away}</Chip>
              </span>
              <button
                type="button"
                onClick={() => remove(ex.id)}
                disabled={pending}
                className="text-sm text-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-control border border-line bg-surface px-2 py-1 text-sm"
        />
        <Button variant="secondary" size="sm" onClick={add} disabled={pending || !date}>
          {strings.availability.addAway}
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Card>
  );
}
