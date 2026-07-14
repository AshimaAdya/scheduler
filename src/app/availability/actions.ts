"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { validateWeeklyAvailability, type TimeRange } from "@/lib/availability/validate";

export type AvailabilityResult = { ok: true } | { ok: false; error: string };

function revalidate(employeeId: string) {
  revalidatePath("/availability");
  revalidatePath(`/manage/employees/${employeeId}/availability`);
  revalidatePath("/manage/availability");
}

/**
 * Replace an employee's recurring availability with the submitted ranges.
 *
 * Authorization is enforced by RLS: an employee can only affect their own rows,
 * a manager any within the business. `employeeId` from the client is therefore
 * safe — RLS rejects writes to anyone else.
 */
export async function saveRecurringAvailability(
  employeeId: string,
  ranges: TimeRange[],
): Promise<AvailabilityResult> {
  await requireUser();

  const validation = validateWeeklyAvailability(ranges);
  if (!validation.ok) return { ok: false, error: validation.message };

  const supabase = await createClient();

  const { error: delError } = await supabase
    .from("availability_rules")
    .delete()
    .eq("employee_id", employeeId)
    .eq("kind", "recurring");
  if (delError) return { ok: false, error: delError.message };

  if (ranges.length > 0) {
    const rows = ranges.map((r) => ({
      employee_id: employeeId,
      kind: "recurring" as const,
      weekday: r.weekday,
      start_time: r.start,
      end_time: r.end,
      is_available: true,
    }));
    const { error: insError } = await supabase
      .from("availability_rules")
      .insert(rows);
    if (insError) return { ok: false, error: insError.message };
  }

  revalidate(employeeId);
  return { ok: true };
}

/** Add a one-off day the employee is away (full-day blackout). */
export async function addException(
  employeeId: string,
  date: string,
): Promise<AvailabilityResult> {
  await requireUser();
  if (!date) return { ok: false, error: "Pick a date." };

  const supabase = await createClient();
  const { error } = await supabase.from("availability_rules").insert({
    employee_id: employeeId,
    kind: "exception",
    exception_date: date,
    is_available: false,
  });
  if (error) return { ok: false, error: error.message };

  revalidate(employeeId);
  return { ok: true };
}

export async function removeException(
  employeeId: string,
  id: string,
): Promise<AvailabilityResult> {
  await requireUser();

  const supabase = await createClient();
  const { error } = await supabase
    .from("availability_rules")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidate(employeeId);
  return { ok: true };
}
