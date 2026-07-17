import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationService } from "@/lib/notifications/types";
import { startCoverageBroadcast, type BroadcastResult } from "./broadcast";

export type SickCallResult = BroadcastResult;

/**
 * Employee reports they can't make a shift. A sick_call is just the shared
 * coverage broadcast (short wait-windows) — see startCoverageBroadcast.
 */
export async function reportSickCall(
  supabase: SupabaseClient,
  params: {
    shiftId: string;
    reporterEmployeeId: string;
    notifier?: NotificationService;
  },
): Promise<SickCallResult> {
  return startCoverageBroadcast(supabase, {
    ...params,
    triggerType: "sick_call",
  });
}
