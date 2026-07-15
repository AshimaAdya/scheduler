import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSettings } from "@/lib/settings/resolve";
import { durationHours } from "@/lib/scheduler/eligibility";
import {
  toSchedulerEmployee,
  toSchedulerSlot,
  type AvailabilityRow,
} from "./build-input";
import { employeeFitsSlot } from "./fits";

export type ClaimResult =
  | { ok: true; pending: boolean }
  | { ok: false; error: string };

/**
 * An employee claims an open shift. Server-side + service-role because it must be
 * atomic and bypass RLS after authorizing the employee:
 *  - the shift must be open (unassigned) in a published schedule,
 *  - the employee must be eligible (skill/availability/hours/overlap),
 *  - the new assignment's `pending_approval` follows approval_mode.
 * The unique(shift_id) constraint makes the claim atomic: if two people claim at
 * once, exactly one insert wins; the loser gets "already taken".
 */
export async function claimShift(
  supabase: SupabaseClient,
  params: { shiftId: string; employeeId: string },
): Promise<ClaimResult> {
  const { data: shift } = await supabase
    .from("shifts")
    .select("id, schedule_id, required_skill, starts_at, ends_at, schedules(status)")
    .eq("id", params.shiftId)
    .maybeSingle();
  if (!shift) return { ok: false, error: "Shift not found." };

  const scheduleRel = shift.schedules as
    | { status: string }
    | { status: string }[]
    | null;
  const scheduleStatus = Array.isArray(scheduleRel)
    ? scheduleRel[0]?.status
    : scheduleRel?.status;
  if (scheduleStatus !== "published") {
    return { ok: false, error: "This shift isn't open for claiming." };
  }

  const { data: existing } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("shift_id", params.shiftId)
    .maybeSingle();
  if (existing) return { ok: false, error: "This shift has already been taken." };

  // Settings (timezone + approval mode).
  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const settings = resolveSettings(business?.settings);

  // Employee + availability + their other shifts in this schedule (week).
  const { data: employeeRow } = await supabase
    .from("employees")
    .select("id, skills, max_weekly_hours, active")
    .eq("id", params.employeeId)
    .maybeSingle();
  if (!employeeRow || !employeeRow.active) {
    return { ok: false, error: "Employee not found." };
  }

  const { data: availability } = await supabase
    .from("availability_rules")
    .select("kind, weekday, exception_date, start_time, end_time, is_available")
    .eq("employee_id", params.employeeId);

  const { data: weekShifts } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at")
    .eq("schedule_id", shift.schedule_id);
  const weekShiftIds = (weekShifts ?? []).map((s) => s.id);
  const shiftById = new Map((weekShifts ?? []).map((s) => [s.id, s]));

  const { data: myAssignments } =
    weekShiftIds.length > 0
      ? await supabase
          .from("shift_assignments")
          .select("shift_id")
          .eq("employee_id", params.employeeId)
          .in("shift_id", weekShiftIds)
      : { data: [] };

  let hours = 0;
  const intervals: { startsAt: Date; endsAt: Date }[] = [];
  for (const a of myAssignments ?? []) {
    const s = shiftById.get(a.shift_id);
    if (!s) continue;
    const startsAt = new Date(s.starts_at);
    const endsAt = new Date(s.ends_at);
    intervals.push({ startsAt, endsAt });
    hours += durationHours(startsAt, endsAt);
  }

  const slot = toSchedulerSlot(shift, settings.timezone);
  const employee = toSchedulerEmployee(
    employeeRow,
    (availability ?? []) as AvailabilityRow[],
  );
  if (!employeeFitsSlot(employee, slot, { hours, intervals })) {
    return { ok: false, error: "You're not eligible for this shift." };
  }

  const pending = settings.approval_mode === "require_approval";
  const { error } = await supabase.from("shift_assignments").insert({
    shift_id: params.shiftId,
    employee_id: params.employeeId,
    assigned_via: "claim" as const,
    pending_approval: pending,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "This shift has already been taken." };
    }
    return { ok: false, error: error.message };
  }

  return { ok: true, pending };
}
