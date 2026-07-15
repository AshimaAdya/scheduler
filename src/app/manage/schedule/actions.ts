"use server";

import { revalidatePath } from "next/cache";
import { getCurrentEmployeeId, requireManager } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  generateScheduleForWeek,
  publishSchedule,
  type GenerateResult,
  type PublishResult,
} from "@/lib/schedule/service";

export async function generateScheduleAction(
  _prev: GenerateResult | null,
  formData: FormData,
): Promise<GenerateResult> {
  await requireManager();
  const actorEmployeeId = await getCurrentEmployeeId();

  const locationId = String(formData.get("location_id") ?? "");
  const weekStart = String(formData.get("week_start") ?? "");
  if (!locationId || !weekStart) {
    return { ok: false, error: "Pick a location and week." };
  }

  // Authorized above; the orchestration uses the service-role client.
  const admin = createServiceRoleClient();
  const result = await generateScheduleForWeek(admin, {
    locationId,
    weekStart,
    actorEmployeeId,
  });

  revalidatePath("/manage/schedule");
  return result;
}

export async function publishScheduleAction(
  _prev: PublishResult | null,
  formData: FormData,
): Promise<PublishResult> {
  await requireManager();
  const actorEmployeeId = await getCurrentEmployeeId();

  const scheduleId = String(formData.get("schedule_id") ?? "");
  if (!scheduleId) return { ok: false, error: "Missing schedule." };

  const admin = createServiceRoleClient();
  const result = await publishSchedule(admin, { scheduleId, actorEmployeeId });

  revalidatePath("/manage/schedule");
  return result;
}
