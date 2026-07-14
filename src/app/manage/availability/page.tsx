import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import { Table, Th, Td } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";

const DAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const hhmm = (t: string) => t.slice(0, 5);

export default async function TeamAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ location?: string }>;
}) {
  const { location } = await searchParams;
  const supabase = await createClient();

  const { data: locations } = await supabase
    .from("locations")
    .select("id, name")
    .order("name");

  const selected = location ?? locations?.[0]?.id ?? null;

  const { data: employees } = selected
    ? await supabase
        .from("employees")
        .select("id, full_name")
        .eq("active", true)
        .eq("home_location_id", selected)
        .order("full_name")
    : { data: [] };

  const employeeIds = (employees ?? []).map((e) => e.id);
  const { data: rules } =
    employeeIds.length > 0
      ? await supabase
          .from("availability_rules")
          .select("employee_id, weekday, start_time, end_time")
          .eq("kind", "recurring")
          .in("employee_id", employeeIds)
      : { data: [] };

  // employeeId -> weekday -> ["09:00–17:00", ...]
  const grid = new Map<string, Map<number, string[]>>();
  for (const r of rules ?? []) {
    if (r.weekday == null || !r.start_time || !r.end_time) continue;
    const byDay = grid.get(r.employee_id) ?? new Map<number, string[]>();
    const list = byDay.get(r.weekday) ?? [];
    list.push(`${hhmm(r.start_time)}–${hhmm(r.end_time)}`);
    byDay.set(r.weekday, list);
    grid.set(r.employee_id, byDay);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.availability.gridTitle}
        actions={
          <Link href="/manage" className={buttonClasses("secondary", "sm")}>
            ← {strings.manage.title}
          </Link>
        }
      />

      <div className="flex flex-wrap gap-2">
        {(locations ?? []).map((loc) => (
          <Link
            key={loc.id}
            href={`/manage/availability?location=${loc.id}`}
            className={buttonClasses(
              loc.id === selected ? "primary" : "secondary",
              "sm",
            )}
          >
            {loc.name}
          </Link>
        ))}
      </div>

      {employeeIds.length === 0 ? (
        <p className="text-sm text-muted">{strings.availability.gridEmpty}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{strings.team.columns.name}</Th>
              {DAYS.map((d) => (
                <Th key={d.value}>{d.label}</Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(employees ?? []).map((e) => {
              const byDay = grid.get(e.id);
              return (
                <tr key={e.id} className="hover:bg-bg">
                  <Td>
                    <Link
                      href={`/manage/employees/${e.id}/availability`}
                      className="font-semibold text-ink hover:text-accent"
                    >
                      {e.full_name}
                    </Link>
                  </Td>
                  {DAYS.map((d) => {
                    const ranges = byDay?.get(d.value);
                    return (
                      <Td key={d.value} className="text-muted">
                        {ranges && ranges.length > 0 ? (
                          <span className="whitespace-nowrap">
                            {ranges.join(", ")}
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </Td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </main>
  );
}
