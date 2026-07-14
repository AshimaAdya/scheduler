import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { AvailabilityEditor } from "@/components/availability-editor";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeAvailability } from "@/lib/availability/queries";
import { strings } from "@/lib/strings";

export default async function ManageEmployeeAvailabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!employee) notFound();

  const availability = await getEmployeeAvailability(supabase, id);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <PageHeader
        title={`${employee.full_name} — ${strings.availability.managerTitle.toLowerCase()}`}
        actions={
          <Link
            href={`/manage/employees/${id}`}
            className={buttonClasses("secondary", "sm")}
          >
            ← {employee.full_name}
          </Link>
        }
      />
      <AvailabilityEditor employeeId={id} initial={availability} />
    </main>
  );
}
