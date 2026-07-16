import type { SupabaseClient } from "@supabase/supabase-js";

export type RecurringRule = {
  id: string;
  weekday: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export type ExceptionRule = {
  id: string;
  date: string; // "YYYY-MM-DD"
  is_available: boolean;
};

export type EmployeeAvailability = {
  recurring: RecurringRule[];
  exceptions: ExceptionRule[];
};

/** Postgres `time` comes back as "HH:MM:SS"; trim to "HH:MM" for the UI. */
function toHHMM(time: string): string {
  return time.slice(0, 5);
}

export async function getEmployeeAvailability(
  client: SupabaseClient,
  employeeId: string,
): Promise<EmployeeAvailability> {
  const { data, error } = await client
    .from("availability_rules")
    .select("id, kind, weekday, exception_date, start_time, end_time, is_available")
    .eq("employee_id", employeeId)
    .order("weekday", { nullsFirst: false })
    .order("start_time", { nullsFirst: false });
  if (error) throw error;

  const recurring: RecurringRule[] = [];
  const exceptions: ExceptionRule[] = [];

  for (const row of data ?? []) {
    if (row.kind === "recurring" && row.start_time && row.end_time) {
      recurring.push({
        id: row.id,
        weekday: row.weekday,
        start: toHHMM(row.start_time),
        end: toHHMM(row.end_time),
      });
    } else if (row.kind === "exception" && row.exception_date) {
      exceptions.push({
        id: row.id,
        date: row.exception_date,
        is_available: row.is_available,
      });
    }
  }

  return { recurring, exceptions };
}
