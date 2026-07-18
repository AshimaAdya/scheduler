import type { SupabaseClient } from "@supabase/supabase-js";
import { generateWeekSlots } from "@/lib/scheduler/generate-slots";
import { GreedyScheduleGenerator } from "@/lib/scheduler/greedy";
import { resolveSettings } from "@/lib/settings/resolve";
import { getNotificationService } from "@/lib/notifications/factory";
import type { NotificationService } from "@/lib/notifications/types";
import {
  toSchedulerEmployee,
  toSchedulerSlot,
  type AvailabilityRow,
} from "./build-input";

/**
 * Draft/publish orchestration. These take a Supabase client so they're testable
 * against the local DB; the server actions pass a service-role client after
 * authorizing the manager. RLS still governs the user-facing read paths.
 */

export type GenerateResult =
  | {
      ok: true;
      scheduleId: string;
      status: "draft" | "published";
      assigned: number;
      unfilled: number;
    }
  | { ok: false; error: string };

/** Deterministic seed per week so re-generating the same week is reproducible. */
function seedFromWeek(weekStart: string): number {
  let h = 0;
  for (let i = 0; i < weekStart.length; i++) {
    h = (h * 31 + weekStart.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export async function generateScheduleForWeek(
  supabase: SupabaseClient,
  params: { locationId: string; weekStart: string; actorEmployeeId?: string | null },
): Promise<GenerateResult> {
  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  if (!business) return { ok: false, error: "No business configured." };
  const settings = resolveSettings(business.settings);

  // Never touch a published schedule. Replace an existing draft.
  const { data: existing } = await supabase
    .from("schedules")
    .select("id, status")
    .eq("location_id", params.locationId)
    .eq("week_start", params.weekStart)
    .maybeSingle();
  if (existing?.status === "published") {
    return {
      ok: false,
      error: "This week is already published — editing happens on the published schedule.",
    };
  }
  if (existing) {
    await supabase.from("schedules").delete().eq("id", existing.id);
  }

  const { data: templates } = await supabase
    .from("shift_templates")
    .select("id, location_id, weekday, start_time, end_time, required_skill, headcount")
    .eq("location_id", params.locationId)
    .eq("active", true);

  const slots = generateWeekSlots(templates ?? [], params.weekStart, settings.timezone);

  const { data: schedule, error: schedErr } = await supabase
    .from("schedules")
    .insert({
      location_id: params.locationId,
      week_start: params.weekStart,
      status: "draft",
      generated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (schedErr || !schedule) {
    return { ok: false, error: schedErr?.message ?? "Failed to create schedule." };
  }

  let assigned = 0;
  let unfilled = 0;

  if (slots.length > 0) {
    const { data: shifts, error: shiftErr } = await supabase
      .from("shifts")
      .insert(
        slots.map((s) => ({
          schedule_id: schedule.id,
          location_id: s.location_id,
          template_id: s.template_id,
          starts_at: s.starts_at.toISOString(),
          ends_at: s.ends_at.toISOString(),
          required_skill: s.required_skill,
        })),
      )
      .select("id, required_skill, starts_at, ends_at");
    if (shiftErr || !shifts) {
      return { ok: false, error: shiftErr?.message ?? "Failed to create shifts." };
    }

    const { data: employees } = await supabase
      .from("employees")
      .select("id, skills, max_weekly_hours")
      .eq("active", true);
    const empIds = (employees ?? []).map((e) => e.id);

    const { data: availability } = await supabase
      .from("availability_rules")
      .select("employee_id, kind, weekday, exception_date, start_time, end_time, is_available")
      .in("employee_id", empIds.length ? empIds : [crypto.randomUUID()]);

    const byEmployee = new Map<string, AvailabilityRow[]>();
    for (const r of availability ?? []) {
      const list = byEmployee.get(r.employee_id) ?? [];
      list.push(r);
      byEmployee.set(r.employee_id, list);
    }

    const generator = new GreedyScheduleGenerator();
    const result = generator.generate({
      slots: shifts.map((s) => toSchedulerSlot(s, settings.timezone)),
      employees: (employees ?? []).map((e) =>
        toSchedulerEmployee(e, byEmployee.get(e.id) ?? []),
      ),
      seed: seedFromWeek(params.weekStart),
    });

    if (result.assignments.length > 0) {
      const { error: asgErr } = await supabase.from("shift_assignments").insert(
        result.assignments.map((a) => ({
          shift_id: a.slotId,
          employee_id: a.employeeId,
          assigned_via: "generator" as const,
        })),
      );
      if (asgErr) return { ok: false, error: asgErr.message };
    }
    assigned = result.assignments.length;
    unfilled = result.unfilled.length;
  }

  await supabase.from("schedule_audit_log").insert({
    schedule_id: schedule.id,
    actor_employee_id: params.actorEmployeeId ?? null,
    action: "generated",
    detail: { assigned, unfilled },
  });

  if (settings.approval_mode === "auto_publish") {
    const pub = await publishSchedule(supabase, {
      scheduleId: schedule.id,
      actorEmployeeId: params.actorEmployeeId,
    });
    if (!pub.ok) return { ok: false, error: pub.error };
    return { ok: true, scheduleId: schedule.id, status: "published", assigned, unfilled };
  }

  return { ok: true, scheduleId: schedule.id, status: "draft", assigned, unfilled };
}

export type PublishResult =
  | { ok: true; notified: number }
  | { ok: false; error: string };

export async function publishSchedule(
  supabase: SupabaseClient,
  params: {
    scheduleId: string;
    actorEmployeeId?: string | null;
    notifier?: NotificationService;
  },
): Promise<PublishResult> {
  const { data: schedule } = await supabase
    .from("schedules")
    .select("id")
    .eq("id", params.scheduleId)
    .maybeSingle();
  if (!schedule) return { ok: false, error: "Schedule not found." };

  const { error: updErr } = await supabase
    .from("schedules")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", params.scheduleId);
  if (updErr) return { ok: false, error: updErr.message };

  // Notify assigned employees.
  const { data: shiftRows } = await supabase
    .from("shifts")
    .select("id")
    .eq("schedule_id", params.scheduleId);
  const shiftIds = (shiftRows ?? []).map((s) => s.id);

  let recipientIds: string[] = [];
  if (shiftIds.length > 0) {
    const { data: assignments } = await supabase
      .from("shift_assignments")
      .select("employee_id")
      .in("shift_id", shiftIds);
    recipientIds = [...new Set((assignments ?? []).map((a) => a.employee_id))];
  }

  const notifier = params.notifier ?? getNotificationService(supabase);
  await notifier.send(
    recipientIds.map((id) => ({
      recipientEmployeeId: id,
      channel: "email" as const,
      template: "schedule_published",
      payload: { scheduleId: params.scheduleId },
    })),
  );

  await supabase.from("schedule_audit_log").insert({
    schedule_id: params.scheduleId,
    actor_employee_id: params.actorEmployeeId ?? null,
    action: "published",
    detail: { notified: recipientIds.length },
  });

  return { ok: true, notified: recipientIds.length };
}

export type ReassignResult = { ok: true } | { ok: false; error: string };

/** Assign (or reassign) a shift. Editing a PUBLISHED schedule writes an audit row. */
export async function reassignShift(
  supabase: SupabaseClient,
  params: { shiftId: string; employeeId: string; actorEmployeeId?: string | null },
): Promise<ReassignResult> {
  const { data: shift } = await supabase
    .from("shifts")
    .select("id, schedule_id")
    .eq("id", params.shiftId)
    .maybeSingle();
  if (!shift) return { ok: false, error: "Shift not found." };

  const { data: schedule } = await supabase
    .from("schedules")
    .select("status")
    .eq("id", shift.schedule_id)
    .maybeSingle();

  const { error } = await supabase
    .from("shift_assignments")
    .upsert(
      {
        shift_id: params.shiftId,
        employee_id: params.employeeId,
        assigned_via: "manager" as const,
      },
      { onConflict: "shift_id" },
    );
  if (error) return { ok: false, error: error.message };

  if (schedule?.status === "published") {
    await supabase.from("schedule_audit_log").insert({
      schedule_id: shift.schedule_id,
      actor_employee_id: params.actorEmployeeId ?? null,
      action: "edited",
      detail: { shiftId: params.shiftId, employeeId: params.employeeId },
    });
  }

  return { ok: true };
}
