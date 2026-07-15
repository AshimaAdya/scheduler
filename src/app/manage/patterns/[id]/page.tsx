import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";
import { PatternForm } from "../pattern-form";
import { PatternActiveToggle } from "./pattern-active-toggle";

const hhmm = (t: string) => t.slice(0, 5);

export default async function EditPatternPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: template }, { data: locations }] = await Promise.all([
    supabase
      .from("shift_templates")
      .select(
        "id, location_id, weekday, start_time, end_time, required_skill, headcount, active",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("locations").select("id, name").order("name"),
  ]);

  if (!template) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <PageHeader
        title={strings.patterns.editTitle}
        actions={
          <Link href="/manage/patterns" className={buttonClasses("secondary", "sm")}>
            ← {strings.patterns.title}
          </Link>
        }
      />

      <div className="flex items-center gap-3">
        {template.active ? (
          <Chip tone="ok">On</Chip>
        ) : (
          <Chip tone="neutral">{strings.patterns.inactive}</Chip>
        )}
        <PatternActiveToggle id={template.id} active={template.active} />
      </div>
      <p className="text-sm text-muted">{strings.patterns.offNote}</p>

      <Card>
        <PatternForm
          mode="edit"
          template={{
            ...template,
            start_time: hhmm(template.start_time),
            end_time: hhmm(template.end_time),
          }}
          locations={locations ?? []}
        />
      </Card>
    </main>
  );
}
