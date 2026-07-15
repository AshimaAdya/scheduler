import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (t: string) => t.slice(0, 5);

export default async function PatternsPage() {
  const supabase = await createClient();
  const { data: templates } = await supabase
    .from("shift_templates")
    .select(
      "id, weekday, start_time, end_time, required_skill, headcount, active, location_id, locations:location_id(name)",
    )
    .order("location_id")
    .order("weekday")
    .order("start_time");

  const rows = templates ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.patterns.title}
        subtitle={strings.patterns.subtitle}
        actions={
          <>
            <Link href="/manage" className={buttonClasses("secondary", "sm")}>
              ← {strings.manage.title}
            </Link>
            <Link
              href="/manage/patterns/new"
              className={buttonClasses("primary", "sm")}
            >
              {strings.patterns.add}
            </Link>
          </>
        }
      />

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{strings.patterns.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((t) => {
            const loc = t.locations as { name: string } | { name: string }[] | null;
            const locName = Array.isArray(loc) ? loc[0]?.name : loc?.name;
            return (
              <Link key={t.id} href={`/manage/patterns/${t.id}`}>
                <Card className="flex items-center justify-between p-4 transition-colors hover:border-accent">
                  <div>
                    <p className="font-semibold text-ink">
                      {WEEKDAY_LABELS[t.weekday]} · {hhmm(t.start_time)}–
                      {hhmm(t.end_time)}
                    </p>
                    <p className="text-sm text-muted">
                      {locName} · {t.headcount} × {t.required_skill}
                    </p>
                  </div>
                  {!t.active && <Chip tone="neutral">{strings.patterns.inactive}</Chip>}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
