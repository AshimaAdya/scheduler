import type { SupabaseClient } from "@supabase/supabase-js";

export type SchedulableFilter = {
  /** Restrict to employees whose home location matches. */
  locationId?: string;
  /** Restrict to employees who have this skill. */
  skill?: string;
};

export type SchedulableEmployee = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  skills: string[];
  max_weekly_hours: number;
  home_location_id: string | null;
};

/**
 * The canonical set of employees eligible for scheduling AND coverage broadcasts.
 *
 * Deactivated employees (`active = false`) are ALWAYS excluded here. The schedule
 * generator (SCH-14) and coverage broadcasts (SCH-15) MUST source candidates from
 * this function rather than querying `employees` ad hoc, so that "deactivate
 * removes them from scheduling and cover asks" is enforced in exactly one place.
 */
export async function getSchedulableEmployees(
  client: SupabaseClient,
  filter: SchedulableFilter = {},
): Promise<SchedulableEmployee[]> {
  let query = client
    .from("employees")
    .select(
      "id, full_name, email, phone, role, skills, max_weekly_hours, home_location_id",
    )
    .eq("active", true);

  if (filter.locationId) query = query.eq("home_location_id", filter.locationId);
  if (filter.skill) query = query.contains("skills", [filter.skill]);

  const { data, error } = await query.order("full_name");
  if (error) throw error;
  return (data ?? []) as SchedulableEmployee[];
}
