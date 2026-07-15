import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";
import { PatternForm } from "../pattern-form";

export default async function NewPatternPage() {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <PageHeader
        title={strings.patterns.addTitle}
        actions={
          <Link href="/manage/patterns" className={buttonClasses("secondary", "sm")}>
            ← {strings.patterns.title}
          </Link>
        }
      />
      <Card>
        <PatternForm mode="create" locations={locations ?? []} />
      </Card>
    </main>
  );
}
