import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resolveSettings } from "@/lib/settings/resolve";
import { strings } from "@/lib/strings";
import { GenerateButton, PublishButton } from "./schedule-controls";

/** Monday on or after today (UTC), as YYYY-MM-DD. */
function defaultWeek(): string {
  const now = new Date();
  const diff = (1 - now.getUTCDay() + 7) % 7;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff),
  );
  return monday.toISOString().slice(0, 10);
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
        .select("id")
        .eq("schedule_id", schedule.id);
      const shiftIds = (shifts ?? []).map((s) => s.id);
      let assignedCount = 0;
      if (shiftIds.length > 0) {
        const { count } = await supabase
          .from("shift_assignments")
          .select("id", { count: "exact", head: true })
          .in("shift_id", shiftIds);
        assignedCount = count ?? 0;
      }
      assigned = assignedCount;
      unfilled = (shifts?.length ?? 0) - assignedCount;
    }
  }

  const isPublished = schedule?.status === "published";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
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
    </main>
  );
}
