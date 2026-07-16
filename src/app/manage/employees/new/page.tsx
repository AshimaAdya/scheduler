import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";
import { EmployeeForm } from "../employee-form";

export default async function NewEmployeePage() {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <PageHeader
        title={strings.person.addTitle}
        actions={
          <Link
            href="/manage/employees"
            className={buttonClasses("secondary", "sm")}
          >
            ← {strings.team.title}
          </Link>
        }
      />
      <Card>
        <EmployeeForm mode="create" locations={locations ?? []} />
      </Card>
    </main>
  );
}
