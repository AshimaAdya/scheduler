import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Table, Th, Td } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";

const roleLabels = strings.person.roles;

export default async function EmployeesPage() {
  const supabase = await createClient();
  const { data: employees } = await supabase
    .from("employees")
    .select("id, full_name, role, skills, active, home_location_id, locations:home_location_id(name)")
    .order("full_name");

  const rows = employees ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.team.title}
        subtitle={strings.team.count(rows.length)}
        actions={
          <>
            <Link href="/manage" className={buttonClasses("secondary", "sm")}>
              ← {strings.manage.title}
            </Link>
            <Link href="/manage/employees/new" className={buttonClasses("primary", "sm")}>
              {strings.team.add}
            </Link>
          </>
        }
      />

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{strings.team.empty}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{strings.team.columns.name}</Th>
              <Th>{strings.team.columns.role}</Th>
              <Th>{strings.team.columns.skills}</Th>
              <Th>{strings.team.columns.home}</Th>
              <Th>{strings.team.columns.status}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              // Supabase returns the embedded relation as an object or array depending on shape.
              const loc = e.locations as { name: string } | { name: string }[] | null;
              const locName = Array.isArray(loc) ? loc[0]?.name : loc?.name;
              return (
                <tr key={e.id} className="hover:bg-bg">
                  <Td>
                    <Link
                      href={`/manage/employees/${e.id}`}
                      className="font-semibold text-ink hover:text-accent"
                    >
                      {e.full_name}
                    </Link>
                  </Td>
                  <Td className="text-muted">
                    {roleLabels[e.role as keyof typeof roleLabels]}
                  </Td>
                  <Td className="text-muted">
                    {e.skills.length ? e.skills.join(", ") : "—"}
                  </Td>
                  <Td className="text-muted">{locName ?? "—"}</Td>
                  <Td>
                    {e.active ? (
                      <Chip tone="ok">{strings.team.active}</Chip>
                    ) : (
                      <Chip tone="neutral">{strings.team.inactive}</Chip>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </main>
  );
}
