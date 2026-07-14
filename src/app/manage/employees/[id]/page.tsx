import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";
import { EmployeeForm } from "../employee-form";
import { ActiveToggle } from "./active-toggle";

const roleLabels = strings.person.roles;

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: employee }, { data: locations }] = await Promise.all([
    supabase
      .from("employees")
      .select(
        "id, full_name, email, phone, role, skills, max_weekly_hours, home_location_id, active",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("locations").select("id, name").order("name"),
  ]);

  if (!employee) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <PageHeader
        title={employee.full_name}
        subtitle={roleLabels[employee.role as keyof typeof roleLabels]}
        actions={
          <Link
            href="/manage/employees"
            className={buttonClasses("secondary", "sm")}
          >
            ← {strings.team.title}
          </Link>
        }
      />

      <div className="flex items-center gap-3">
        {employee.active ? (
          <Chip tone="ok">{strings.team.active}</Chip>
        ) : (
          <Chip tone="neutral">{strings.team.inactive}</Chip>
        )}
        <ActiveToggle id={employee.id} active={employee.active} />
      </div>
      <p className="text-sm text-muted">{strings.person.deactivateNote}</p>

      <Link
        href={`/manage/employees/${employee.id}/availability`}
        className={buttonClasses("secondary", "sm") + " self-start"}
      >
        {strings.availability.managerTitle}
      </Link>

      <Card>
        <h2 className="mb-4 text-lg font-semibold text-ink">
          {strings.person.editTitle}
        </h2>
        <EmployeeForm
          mode="edit"
          employee={employee}
          locations={locations ?? []}
        />
      </Card>
    </main>
  );
}
