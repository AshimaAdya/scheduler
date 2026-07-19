import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { firstName } from "@/lib/name";

/**
 * Data for the manager live-ops board (SCH-29): who's been contacted / declined /
 * still deciding on each open request, and the shifts still unfilled this week.
 * Runs on the manager's authenticated client (RLS: managers read all in-business).
 */

/** Per request: who declined and who hasn't responded yet (first names). */
export type OfferBreakdown = { declined: string[]; waiting: string[]; asked: number };

export async function getOfferBreakdown(
  supabase: SupabaseClient,
  requestIds: string[],
): Promise<Map<string, OfferBreakdown>> {
  if (requestIds.length === 0) return new Map();

  const { data: offers } = await supabase
    .from("coverage_offers")
    .select("coverage_request_id, employee_id, response")
    .in("coverage_request_id", requestIds);

  const empIds = [...new Set((offers ?? []).map((o) => o.employee_id))];
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", empIds)
    : { data: [] };
  const nameById = new Map((emps ?? []).map((e) => [e.id, firstName(e.full_name)]));

  const map = new Map<string, OfferBreakdown>();
  for (const o of offers ?? []) {
    const b = map.get(o.coverage_request_id) ?? { declined: [], waiting: [], asked: 0 };
    b.asked += 1;
    const name = nameById.get(o.employee_id) ?? "Someone";
    if (o.response === "declined") b.declined.push(name);
    else if (o.response === "pending") b.waiting.push(name);
    map.set(o.coverage_request_id, b);
  }
  return map;
}

/** A published shift in the next 7 days with nobody assigned. */
export type UnfilledShift = {
  id: string;
  when: string;
  skill: string;
  locationName: string | null;
};

type ShiftRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  required_skill: string;
  locations: { name: string } | { name: string }[] | null;
};

export async function getUnfilledThisWeek(
  supabase: SupabaseClient,
  timezone: string,
): Promise<UnfilledShift[]> {
  const now = new Date();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: shifts } = await supabase
    .from("shifts")
    .select(
      "id, starts_at, ends_at, required_skill, schedules!inner(status), locations:location_id(name)",
    )
    .eq("schedules.status", "published")
    .gte("starts_at", now.toISOString())
    .lt("starts_at", weekEnd.toISOString())
    .order("starts_at");

  const ids = (shifts ?? []).map((s) => s.id);
  const { data: assignments } = ids.length
    ? await supabase.from("shift_assignments").select("shift_id").in("shift_id", ids)
    : { data: [] };
  const assigned = new Set((assignments ?? []).map((a) => a.shift_id));

  return (shifts as unknown as ShiftRow[])
    .filter((s) => !assigned.has(s.id))
    .map((s) => {
      const loc = s.locations;
      const locationName = Array.isArray(loc) ? (loc[0]?.name ?? null) : (loc?.name ?? null);
      return {
        id: s.id,
        when: `${formatInTimeZone(new Date(s.starts_at), timezone, "EEE MMM d · HH:mm")}–${formatInTimeZone(new Date(s.ends_at), timezone, "HH:mm")}`,
        skill: s.required_skill,
        locationName,
      };
    });
}
