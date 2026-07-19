import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { resolveSettings } from "@/lib/settings/resolve";
import { firstName } from "@/lib/name";

/**
 * The signed-in employee's own coverage requests (sick call, day off, swap) with
 * their live status — for the "My requests" screen (SCH-28). Runs service-role so
 * it can resolve the coverer's name (the requester is entitled to know who's
 * covering them); only a first name is exposed. Scope to the caller's own id.
 */
export type MyRequest = {
  id: string;
  trigger: string; // sick_call | day_off | direct_swap
  status: string;
  when: string;
  skill: string | null;
  coveredByFirstName: string | null;
  approved: boolean;
};

type ShiftEmbed = {
  starts_at: string;
  ends_at: string;
  required_skill: string;
};

export async function getMyRequests(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<MyRequest[]> {
  const { data: business } = await supabase
    .from("businesses")
    .select("settings")
    .limit(1)
    .maybeSingle();
  const tz = resolveSettings(business?.settings).timezone;

  const { data: rows } = await supabase
    .from("coverage_requests")
    .select(
      "id, trigger_type, status, covered_by, time_off_approved_at, shifts:shift_id(starts_at, ends_at, required_skill)",
    )
    .eq("requested_by", employeeId)
    .order("created_at", { ascending: false })
    .limit(25);
  const list = rows ?? [];

  const coverIds = [...new Set(list.map((r) => r.covered_by).filter(Boolean) as string[])];
  const { data: emps } = coverIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", coverIds)
    : { data: [] };
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  return list.map((r) => {
    const rel = r.shifts as ShiftEmbed | ShiftEmbed[] | null;
    const shift = Array.isArray(rel) ? rel[0] : rel;
    return {
      id: r.id,
      trigger: r.trigger_type,
      status: r.status,
      when: shift
        ? `${formatInTimeZone(new Date(shift.starts_at), tz, "EEE MMM d · HH:mm")}–${formatInTimeZone(new Date(shift.ends_at), tz, "HH:mm")}`
        : "—",
      skill: shift?.required_skill ?? null,
      coveredByFirstName: r.covered_by ? firstName(nameById.get(r.covered_by)) : null,
      approved: !!r.time_off_approved_at,
    };
  });
}
