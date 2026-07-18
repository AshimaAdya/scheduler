import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import type { NotificationService } from "./types";
import type { DeliveryChannel } from "./channels/types";
import { ResendEmailChannel } from "./channels/resend-email";
import { MultiChannelNotificationService } from "./service";

/**
 * The default NotificationService used by every flow that doesn't inject its own.
 * Registers real channels based on configured env — Resend email when
 * RESEND_API_KEY + RESEND_FROM are set. With no channels configured (local/CI),
 * sends are recorded as `queued` so the audit trail still works and no network is
 * touched. SMS (SCH-26) will register here too, with no caller changes.
 */
export function getNotificationService(supabase: SupabaseClient): NotificationService {
  const channels: DeliveryChannel[] = [];

  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM;
  if (resendKey && resendFrom) {
    channels.push(
      new ResendEmailChannel({
        apiKey: resendKey,
        fromName: DEFAULT_SETTINGS.notifications.from_name,
        fromEmail: resendFrom,
      }),
    );
  }

  return new MultiChannelNotificationService(supabase, { channels });
}
