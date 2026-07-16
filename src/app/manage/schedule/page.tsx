import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resolveSettings } from "@/lib/settings/resolve";
import { strings } from "@/lib/strings";
import { GenerateButton, PublishButton } from "./schedule-controls";
import {
  ScheduleGrid,
  type DayColumn,
  type ShiftView,
} from "./schedule-grid";

/** Monday on or after today (UTC), as YYYY-MM-DD. */
function defaultWeek(): string {
  const now = new Date();
  const diff = (1 - now.getUTCDay() + 7) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff),
  );
  return monday.toISOString().slice(0, 10);
}

const DAY_ORDER: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Mon" },
  { weekday: 2, label: "Tue" },
  { weekday: 3, label: "Wed" },
  { weekday: 4, label: "Thu" },
  { weekday: 5, label: "Fri" },
  { weekday: 6, label: "Sat" },
  { weekday: 0, label: "Sun" },
];

type ShiftRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  required_skill: string;
};

function buildDays(
  shifts: ShiftRow[],
  assigneeByShift: Map<string, string | null>,
  timezone: string,
): DayColumn[] {
  const byWeekday = new Map<number, ShiftView[]>();
  for (const s of shifts) {
    const startsAt = new Date(s.starts_at);
    const localDate = formatInTimeZone(startsAt, timezone, "yyyy-MM-dd");
    const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
    const view: ShiftView = {
      id: s.id,
      timeLabel: `${formatInTimeZone(startsAt, timezone, "HH:mm")}–${formatInTimeZone(new Date(s.ends_at), timezone, "HH:mm")}`,
      skill: s.required_skill,
      assigneeName: assigneeByShift.get(s.id) ?? null,
    };
    const list = byWeekday.get(weekday) ?? [];
    list.push(view);
    byWeekday.set(weekday, list);
  }
  return DAY_ORDER.map((d) => ({
    weekday: d.weekday,
    label: d.label,
    shifts: (byWeekday.get(d.weekday) ?? []).sort((a, b) =>
      a.timeLabel.localeCompare(b.timeLabel),
    ),
  }));
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; week?: string }>;
}) {
  const { location, week } = await searchParams;
  const supabase = await createClient();

  const [{ data: locations }, { data: business }] = await Promise.all([
    supabase.from("locations").select("id, name").order("name"),
    supabase.from("businesses").select("settings").limit(1).maybeSingle(),
  ]);

  const settings = resolveSettings(business?.settings);
  const selectedLocation = location ?? locations?.[0]?.id ?? "";
  const weekStart = week ?? defaultWeek();

  let schedule: { id: string; status: string } | null = null;
  let assigned = 0;
  let unfilled = 0;
  let days: DayColumn[] = [];
  if (selectedLocation) {
    const { data } = await supabase
      .from("schedules")
      .select("id, status")
      .eq("location_id", selectedLocation)
      .eq("week_start", weekStart)
      .maybeSingle();
    schedule = data;

    if (schedule) {
      const { data: shifts } = await supabase
        .from("shifts")
        .select("id, starts_at, ends_at, required_skill")
        .eq("schedule_id", schedule.id);
      const shiftIds = (shifts ?? []).map((s) => s.id);

      const { data: assignments } =
        shiftIds.length > 0
          ? await supabase
              .from("shift_assignments")
              .select("shift_id, employee_id")
              .in("shift_id", shiftIds)
          : { data: [] };

      const empIds = [...new Set((assignments ?? []).map((a) => a.employee_id))];
      const { data: emps } =
        empIds.length > 0
          ? await supabase.from("employees").select("id, full_name").in("id", empIds)
          : { data: [] };
      const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

      const assigneeByShift = new Map<string, string | null>(
        (assignments ?? []).map((a) => [a.shift_id, nameById.get(a.employee_id) ?? null]),
      );

      assigned = assignments?.length ?? 0;
      unfilled = (shifts?.length ?? 0) - assigned;
      days = buildDays((shifts ?? []) as ShiftRow[], assigneeByShift, settings.timezone);
    }
  }

  const isPublished = schedule?.status === "published";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.schedule.title}
        subtitle={strings.schedule.subtitle}
        actions={
          <Link href="/manage" className={buttonClasses("secondary", "sm")}>
            ← {strings.manage.title}
          </Link>
        }
      />

      {/* Location + week pickers (GET form) */}
      <Card>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">{strings.schedule.location}</span>
            <select
              name="location"
              defaultValue={selectedLocation}
              className="rounded-control border border-line bg-surface px-3 py-2 text-sm"
            >
              {(locations ?? []).map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">{strings.schedule.week}</span>
            <input
              type="date"
              name="week"
              defaultValue={weekStart}
              className="rounded-control border border-line bg-surface px-3 py-2 text-sm"
            />
          </label>
          <button type="submit" className={buttonClasses("secondary", "md")}>
            {strings.schedule.show}
          </button>
        </form>
      </Card>

      <Card className="flex flex-col gap-4">
        {schedule ? (
          <>
            <div className="flex items-center gap-3">
              {isPublished ? (
                <Chip tone="ok">{strings.schedule.published}</Chip>
              ) : (
                <Chip tone="warn">{strings.schedule.draft}</Chip>
              )}
              <span className="text-sm text-muted">
                {strings.schedule.assigned}: {assigned} · {strings.schedule.unfilled}:{" "}
                {unfilled}
              </span>
            </div>
            <p className="text-sm text-muted">
              {isPublished
                ? strings.schedule.publishedNote
                : settings.approval_mode === "auto_publish"
                  ? strings.schedule.autoNote
                  : strings.schedule.reviewNote}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">{strings.schedule.none}</p>
        )}

        <div className="flex flex-wrap gap-3">
          {selectedLocation && (
            <GenerateButton
              locationId={selectedLocation}
              weekStart={weekStart}
              existing={!!schedule}
              disabled={isPublished}
            />
          )}
          {schedule && !isPublished && <PublishButton scheduleId={schedule.id} />}
        </div>

        {isPublished && (
          <p className="text-sm text-faint">{strings.schedule.publishedLocked}</p>
        )}
      </Card>

      {schedule && days.some((d) => d.shifts.length > 0) && (
        <Card className="flex flex-col gap-3">
          <ScheduleGrid days={days} />
        </Card>
      )}
    </main>
  );
}
