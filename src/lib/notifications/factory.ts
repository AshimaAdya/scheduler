import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import type { NotificationService } from "./types";
import type { DeliveryChannel } from "./channels/types";
import { ResendEmailChannel } from "./channels/resend-email";
import { TwilioSmsChannel } from "./channels/twilio-sms";
import { MultiChannelNotificationService } from "./service";

/** The delivery channels enabled by the current environment (exported for tests). */
export function buildChannels(): DeliveryChannel[] {
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

  // SMS is gated behind an EXPLICIT SMS_LIVE flag on top of real credentials, so
  // no dev/CI run can ever text real staff — without it, no channel is
  // registered and sms preferences are logged as `queued`.
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
  if (process.env.SMS_LIVE === "true" && twilioSid && twilioToken && twilioFrom) {
    channels.push(
      new TwilioSmsChannel({ accountSid: twilioSid, authToken: twilioToken, from: twilioFrom }),
    );
  }

  return channels;
}

/**
 * The default NotificationService used by every flow that doesn't inject its own.
 * With no channels configured (local/CI) sends are recorded as `queued`, so the
 * audit trail still works and no network is touched.
 */
export function getNotificationService(supabase: SupabaseClient): NotificationService {
  return new MultiChannelNotificationService(supabase, { channels: buildChannels() });
}
