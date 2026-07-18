import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { resolveSettings } from "@/lib/settings/resolve";
import { durationHours } from "@/lib/scheduler/eligibility";
import { employeeFitsSlot } from "@/lib/schedule/fits";
import { eligibleEmployeesForShift } from "@/lib/schedule/eligible";
import {
  toSchedulerEmployee,
  toSchedulerSlot,
  type AvailabilityRow,
} from "@/lib/schedule/build-input";
import { getNotificationService } from "@/lib/notifications/factory";
import type {
  NotificationMessage,
  NotificationService,
} from "@/lib/notifications/types";
import { startCoverageBroadcast, type BroadcastResult } from "./broadcast";
import { transition } from "./transition";

/**
 * Trigger 3 — direct (two-way) swap. Employee A proposes trading one of their
 * shifts for one of coworker B's; B accepts or declines. Runs service-role (the
 * caller is authorized in the action layer); the atomic parts live in the
 * `accept_swap` / `coverage_transition` RPCs (migration 20260716130000).
 *
 * Invariant #3: the disclosure helpers return only what the swap needs — a
 * coworker's name and the specific shifts A is eligible for — never a full
 * schedule. Elevated reads happen here (service-role), not by loosening RLS.
 */

const ACTIVE_STATUSES = ["open", "tier1_broadcast", "tier2_broadcast", "escalated"];

export type SwapCandidate = { id: string; full_name: string };

export type ShiftSummary = {
  id: string;
  dateLabel: string;
  timeLabel: string;
  skill: string;
  locationName: string | null;
};

export type IncomingSwap = {
  requestId: string;
  requesterName: string;
  youGiveUp: ShiftSummary; // B's current shift (offered_shift_id)
  youGet: ShiftSummary; //    A's shift (shift_id)
};

export type OutgoingSwap = { requestId: string; shift: ShiftSummary };

export type SwapResult = { ok: true; requestId: string } | { ok: false; error: string };
export type AcceptResult = { ok: true; pending: boolean } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

type ShiftRowFull = {
  id: string;
  schedule_id: string;
  required_skill: string;
  starts_at: string;
  ends_at: string;
  location_id?: string;
  locations?: { name: string } | { name: string }[] | null;
};

function locName(rel: ShiftRowFull["locations"]): string | null {
  return Array.isArray(rel) ? (rel[0]?.name ?? null) : (rel?.name ?? null);
}

function summarize(shift: ShiftRowFull, timezone: string): ShiftSummary {
  return {
    id: shift.id,
    dateLabel: formatInTimeZone(new Date(shift.starts_at), timezone, "EEE MMM d"),
    timeLabel: `${formatInTimeZone(new Date(shift.starts_at), timezone, "HH:mm")}–${formatInTimeZone(new Date(shift.ends_at), timezone, "HH:mm")}`,
    skill: shift.required_skill,
    locationName: locName(shift.locations),
  };
}

async function loadTimezone(supabase: SupabaseClient): Promise<string> {
  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  return resolveSettings(business?.settings).timezone;
}

/**
 * Whether `employeeId` can work `shift`, given their OTHER shifts that week —
 * excluding any shift they'd give up in a swap (`excludeShiftIds`). Reuses the
 * shared `employeeFitsSlot` so this never drifts from the generator/claim rules.
 */
async function employeeFitsShift(
  supabase: SupabaseClient,
  shift: ShiftRowFull,
  employeeId: string,
  timezone: string,
  excludeShiftIds: string[],
): Promise<boolean> {
  const { data: emp } = await supabase
    .from("employees")
    .select("id, skills, max_weekly_hours, active")
    .eq("id", employeeId)
    .maybeSingle();
  if (!emp || !emp.active) return false;

  const { data: availability } = await supabase
    .from("availability_rules")
    .select("kind, weekday, exception_date, start_time, end_time, is_available")
    .eq("employee_id", employeeId);

  const { data: weekShifts } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at")
    .eq("schedule_id", shift.schedule_id);
  const shiftById = new Map((weekShifts ?? []).map((s) => [s.id, s]));
  const weekShiftIds = (weekShifts ?? []).map((s) => s.id);

  const { data: assignments } =
    weekShiftIds.length > 0
      ? await supabase
          .from("shift_assignments")
          .select("shift_id")
          .eq("employee_id", employeeId)
          .in("shift_id", weekShiftIds)
      : { data: [] };

  const exclude = new Set([shift.id, ...excludeShiftIds]);
  let hours = 0;
  const intervals: { startsAt: Date; endsAt: Date }[] = [];
  for (const a of assignments ?? []) {
    if (exclude.has(a.shift_id)) continue;
    const s = shiftById.get(a.shift_id);
    if (!s) continue;
    const startsAt = new Date(s.starts_at);
    const endsAt = new Date(s.ends_at);
    intervals.push({ startsAt, endsAt });
    hours += durationHours(startsAt, endsAt);
  }

  const slot = toSchedulerSlot(shift, timezone);
  const se = toSchedulerEmployee(emp, (availability ?? []) as AvailabilityRow[]);
  return employeeFitsSlot(se, slot, { hours, intervals });
}

async function loadShift(
  supabase: SupabaseClient,
  shiftId: string,
): Promise<ShiftRowFull | null> {
  const { data } = await supabase
    .from("shifts")
    .select(
      "id, schedule_id, required_skill, starts_at, ends_at, location_id, locations:location_id(name)",
    )
    .eq("id", shiftId)
    .maybeSingle();
  return (data as ShiftRowFull | null) ?? null;
}

async function hasActiveRequest(
  supabase: SupabaseClient,
  shiftId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("coverage_requests")
    .select("id")
    .eq("shift_id", shiftId)
    .in("status", ACTIVE_STATUSES)
    .limit(1);
  return (data ?? []).length > 0;
}

async function assignedTo(
  supabase: SupabaseClient,
  shiftId: string,
  employeeId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("shift_assignments")
    .select("id")
    .eq("shift_id", shiftId)
    .eq("employee_id", employeeId)
    .maybeSingle();
  return !!data;
}

/** Coworkers eligible to take A's shift (name only — invariant #3), excluding A. */
export async function swapCandidates(
  supabase: SupabaseClient,
  params: { shiftId: string; aEmployeeId: string },
): Promise<SwapCandidate[]> {
  const eligible = await eligibleEmployeesForShift(supabase, params.shiftId);
  return eligible.filter((e) => e.id !== params.aEmployeeId);
}

/**
 * B's shifts that A is actually eligible for (the valid trade pairs). Discloses
 * only these specific shifts, never B's whole schedule. A's own shift is excluded
 * from A's hour/overlap budget since A gives it up in the trade.
 */
export async function tradeableShifts(
  supabase: SupabaseClient,
  params: { aEmployeeId: string; aShiftId: string; targetEmployeeId: string },
): Promise<ShiftSummary[]> {
  const timezone = await loadTimezone(supabase);
  const nowIso = new Date().toISOString();

  const { data: bAssignments } = await supabase
    .from("shift_assignments")
    .select("shift_id")
    .eq("employee_id", params.targetEmployeeId);
  const bShiftIds = (bAssignments ?? []).map((a) => a.shift_id);
  if (bShiftIds.length === 0) return [];

  const { data: bShifts } = await supabase
    .from("shifts")
    .select(
      "id, schedule_id, required_skill, starts_at, ends_at, location_id, locations:location_id(name)",
    )
    .in("id", bShiftIds)
    .gte("starts_at", nowIso)
    .order("starts_at");

  const out: ShiftSummary[] = [];
  for (const s of (bShifts ?? []) as ShiftRowFull[]) {
    if (s.id === params.aShiftId) continue;
    const fits = await employeeFitsShift(supabase, s, params.aEmployeeId, timezone, [
      params.aShiftId,
    ]);
    if (fits) out.push(summarize(s, timezone));
  }
  return out;
}

/** A proposes a two-way trade of `aShiftId` for B's `offeredShiftId`. */
export async function proposeSwap(
  supabase: SupabaseClient,
  params: {
    aEmployeeId: string;
    aShiftId: string;
    targetEmployeeId: string;
    offeredShiftId: string;
    notifier?: NotificationService;
  },
): Promise<SwapResult> {
  if (params.targetEmployeeId === params.aEmployeeId) {
    return { ok: false, error: "You can't swap with yourself." };
  }
  if (!(await assignedTo(supabase, params.aShiftId, params.aEmployeeId))) {
    return { ok: false, error: "That shift isn't yours." };
  }
  if (!(await assignedTo(supabase, params.offeredShiftId, params.targetEmployeeId))) {
    return { ok: false, error: "That shift is no longer available to trade." };
  }
  if (await hasActiveRequest(supabase, params.aShiftId)) {
    return { ok: false, error: "There's already a request for your shift." };
  }
  if (await hasActiveRequest(supabase, params.offeredShiftId)) {
    return { ok: false, error: "There's already a request for that shift." };
  }

  const timezone = await loadTimezone(supabase);
  const aShift = await loadShift(supabase, params.aShiftId);
  const bShift = await loadShift(supabase, params.offeredShiftId);
  if (!aShift || !bShift) return { ok: false, error: "Shift not found." };

  // Both sides must be eligible at proposal time (re-checked again at accept).
  const bFitsA = await employeeFitsShift(supabase, aShift, params.targetEmployeeId, timezone, [
    params.offeredShiftId,
  ]);
  const aFitsB = await employeeFitsShift(supabase, bShift, params.aEmployeeId, timezone, [
    params.aShiftId,
  ]);
  if (!bFitsA || !aFitsB) {
    return { ok: false, error: "This trade doesn't work for both schedules." };
  }

  const { data: request, error: reqError } = await supabase
    .from("coverage_requests")
    .insert({
      shift_id: params.aShiftId,
      requested_by: params.aEmployeeId,
      trigger_type: "direct_swap",
      trade_type: "two_way",
      status: "open",
      target_employee_id: params.targetEmployeeId,
      offered_shift_id: params.offeredShiftId,
    })
    .select("id")
    .single();
  if (reqError || !request) {
    return { ok: false, error: reqError?.message ?? "Could not propose the swap." };
  }

  const { error: offerError } = await supabase.from("coverage_offers").insert({
    coverage_request_id: request.id,
    employee_id: params.targetEmployeeId,
    tier: 1,
    response: "pending" as const,
  });
  if (offerError) return { ok: false, error: offerError.message };

  const notifier = params.notifier ?? getNotificationService(supabase);
  await notifier.send([
    {
      recipientEmployeeId: params.targetEmployeeId,
      channel: "sms",
      template: "coverage_swap_proposed",
      payload: { shiftId: params.aShiftId, offeredShiftId: params.offeredShiftId },
      coverageRequestId: request.id,
    },
  ]);

  return { ok: true, requestId: request.id };
}

type SwapRequestRow = {
  id: string;
  trigger_type: string;
  status: string;
  requested_by: string;
  target_employee_id: string | null;
  shift_id: string;
  offered_shift_id: string | null;
};

async function loadSwapRequest(
  supabase: SupabaseClient,
  requestId: string,
): Promise<SwapRequestRow | null> {
  const { data } = await supabase
    .from("coverage_requests")
    .select(
      "id, trigger_type, status, requested_by, target_employee_id, shift_id, offered_shift_id",
    )
    .eq("id", requestId)
    .maybeSingle();
  return (data as SwapRequestRow | null) ?? null;
}

/**
 * Re-validate BOTH directions of a swap against CURRENT data (availability may
 * have changed since the proposal). Each party's given-up shift is excluded from
 * their own budget. Called at accept time — the AC requires this, not just at
 * proposal time.
 */
export async function validateSwapPair(
  supabase: SupabaseClient,
  request: SwapRequestRow,
): Promise<SimpleResult> {
  if (!request.target_employee_id || !request.offered_shift_id) {
    return { ok: false, error: "This isn't a valid swap." };
  }
  const timezone = await loadTimezone(supabase);
  const aShift = await loadShift(supabase, request.shift_id);
  const bShift = await loadShift(supabase, request.offered_shift_id);
  if (!aShift || !bShift) return { ok: false, error: "A shift no longer exists." };

  const bFitsA = await employeeFitsShift(
    supabase,
    aShift,
    request.target_employee_id,
    timezone,
    [request.offered_shift_id],
  );
  const aFitsB = await employeeFitsShift(
    supabase,
    bShift,
    request.requested_by,
    timezone,
    [request.shift_id],
  );
  if (!bFitsA || !aFitsB) {
    return { ok: false, error: "Schedules changed — this trade no longer works." };
  }
  return { ok: true };
}

function friendlyAcceptError(message: string): string {
  if (message.includes("swap_not_open")) return "This swap is no longer open.";
  if (message.includes("swap_assignment_changed")) {
    return "One of the shifts changed — the swap was cancelled.";
  }
  if (message.includes("not_swap_target")) return "This swap isn't addressed to you.";
  return "Could not complete the swap.";
}

/** B accepts: re-validate, then atomically swap both assignments + set covered. */
export async function acceptSwap(
  supabase: SupabaseClient,
  params: { requestId: string; actorEmployeeId: string; notifier?: NotificationService },
): Promise<AcceptResult> {
  const req = await loadSwapRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "Swap not found." };
  if (req.trigger_type !== "direct_swap") return { ok: false, error: "Not a swap." };
  if (req.status !== "open") return { ok: false, error: "This swap is no longer open." };
  if (req.target_employee_id !== params.actorEmployeeId) {
    return { ok: false, error: "This swap isn't addressed to you." };
  }

  const valid = await validateSwapPair(supabase, req);
  if (!valid.ok) return valid;

  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const pending = resolveSettings(business?.settings).approval_mode === "require_approval";

  const { error } = await supabase.rpc("accept_swap", {
    p_request_id: params.requestId,
    p_actor: params.actorEmployeeId,
    p_pending_approval: pending,
  });
  if (error) return { ok: false, error: friendlyAcceptError(error.message ?? "") };

  const notifier = params.notifier ?? getNotificationService(supabase);
  const messages: NotificationMessage[] = [
    {
      recipientEmployeeId: req.requested_by,
      channel: "sms",
      template: "coverage_swap_accepted",
      payload: { shiftId: req.shift_id },
      coverageRequestId: req.id,
    },
  ];
  if (pending) {
    const { data: managers } = await supabase
      .from("employees")
      .select("id")
      .in("role", ["manager", "admin"])
      .eq("active", true);
    for (const m of managers ?? []) {
      messages.push({
        recipientEmployeeId: m.id,
        channel: "email",
        template: "coverage_swap_pending_approval",
        payload: { requestId: req.id },
        coverageRequestId: req.id,
      });
    }
  }
  await notifier.send(messages);

  return { ok: true, pending };
}

/** B declines: mark the offer declined and cancel the request. */
export async function declineSwap(
  supabase: SupabaseClient,
  params: { requestId: string; actorEmployeeId: string; notifier?: NotificationService },
): Promise<SimpleResult> {
  const req = await loadSwapRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "Swap not found." };
  if (req.trigger_type !== "direct_swap") return { ok: false, error: "Not a swap." };
  if (req.status !== "open") return { ok: false, error: "This swap is no longer open." };
  if (req.target_employee_id !== params.actorEmployeeId) {
    return { ok: false, error: "This swap isn't addressed to you." };
  }

  await supabase
    .from("coverage_offers")
    .update({ response: "declined", responded_at: new Date().toISOString() })
    .eq("coverage_request_id", req.id)
    .eq("employee_id", params.actorEmployeeId);

  await transition(supabase, {
    requestId: req.id,
    to: "cancelled",
    actorEmployeeId: params.actorEmployeeId,
    detail: { reason: "swap_declined" },
  });

  const notifier = params.notifier ?? getNotificationService(supabase);
  await notifier.send([
    {
      recipientEmployeeId: req.requested_by,
      channel: "sms",
      template: "coverage_swap_declined",
      payload: { shiftId: req.shift_id },
      coverageRequestId: req.id,
    },
  ]);

  return { ok: true };
}

/**
 * After a decline, A can broadcast the shift for cover instead (becomes a
 * day_off-style tiered broadcast). Reuses the SCH-20 engine.
 */
export async function convertSwapToBroadcast(
  supabase: SupabaseClient,
  params: { requestId: string; actorEmployeeId: string; notifier?: NotificationService },
): Promise<BroadcastResult> {
  const req = await loadSwapRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "Swap not found." };
  if (req.trigger_type !== "direct_swap") return { ok: false, error: "Not a swap." };
  if (req.requested_by !== params.actorEmployeeId) {
    return { ok: false, error: "This swap isn't yours." };
  }
  if (req.status !== "cancelled") {
    return { ok: false, error: "This swap is still active." };
  }
  return startCoverageBroadcast(supabase, {
    shiftId: req.shift_id,
    reporterEmployeeId: params.actorEmployeeId,
    triggerType: "day_off",
    notifier: params.notifier,
  });
}

/**
 * Manager confirms a swap made under require_approval: clears `pending_approval`
 * on both swapped assignments (the swap itself already executed atomically on
 * accept). Called with an authorized manager client.
 */
export async function confirmSwap(
  supabase: SupabaseClient,
  params: { requestId: string },
): Promise<SimpleResult> {
  const req = await loadSwapRequest(supabase, params.requestId);
  if (!req) return { ok: false, error: "Swap not found." };
  if (req.trigger_type !== "direct_swap") return { ok: false, error: "Not a swap." };
  if (req.status !== "covered" || !req.offered_shift_id) {
    return { ok: false, error: "This swap isn't ready to confirm." };
  }

  const { error } = await supabase
    .from("shift_assignments")
    .update({ pending_approval: false })
    .in("shift_id", [req.shift_id, req.offered_shift_id]);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

/** Open swap proposals addressed to `employeeId` (B's inbox). Service-role. */
export async function getIncomingSwaps(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<IncomingSwap[]> {
  const { data: requests } = await supabase
    .from("coverage_requests")
    .select("id, requested_by, shift_id, offered_shift_id")
    .eq("trigger_type", "direct_swap")
    .eq("status", "open")
    .eq("target_employee_id", employeeId);
  if (!requests || requests.length === 0) return [];

  const timezone = await loadTimezone(supabase);
  const requesterIds = [...new Set(requests.map((r) => r.requested_by))];
  const { data: emps } = await supabase
    .from("employees")
    .select("id, full_name")
    .in("id", requesterIds);
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  const out: IncomingSwap[] = [];
  for (const r of requests) {
    if (!r.offered_shift_id) continue;
    const youGet = await loadShift(supabase, r.shift_id); // A's shift B would take
    const youGiveUp = await loadShift(supabase, r.offered_shift_id); // B's shift
    if (!youGet || !youGiveUp) continue;
    out.push({
      requestId: r.id,
      requesterName: nameById.get(r.requested_by) ?? "A coworker",
      youGiveUp: summarize(youGiveUp, timezone),
      youGet: summarize(youGet, timezone),
    });
  }
  return out;
}

/**
 * A's declined swaps whose shift has no active request — the "broadcast instead?"
 * prompt. Once A re-proposes or broadcasts, the shift has an active request and
 * drops off this list. Service-role.
 */
export async function getOutgoingSwaps(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<OutgoingSwap[]> {
  const { data: requests } = await supabase
    .from("coverage_requests")
    .select("id, shift_id")
    .eq("trigger_type", "direct_swap")
    .eq("requested_by", employeeId)
    .eq("status", "cancelled")
    .order("resolved_at", { ascending: false });
  if (!requests || requests.length === 0) return [];

  const timezone = await loadTimezone(supabase);
  const seen = new Set<string>();
  const out: OutgoingSwap[] = [];
  for (const r of requests) {
    if (seen.has(r.shift_id)) continue;
    seen.add(r.shift_id);
    if (await hasActiveRequest(supabase, r.shift_id)) continue;
    const shift = await loadShift(supabase, r.shift_id);
    if (!shift) continue;
    out.push({ requestId: r.id, shift: summarize(shift, timezone) });
  }
  return out;
}
