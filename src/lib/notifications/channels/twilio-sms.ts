import type { NotificationChannel } from "../types";
import type { ChannelRecipient, DeliveryChannel, RenderedMessage } from "./types";

/**
 * SMS delivery via Twilio, over `fetch` (no SDK dependency). Throws on a missing
 * phone number or a non-2xx response so the service retries/records it.
 *
 * This is only ever constructed by the factory when SMS is explicitly enabled
 * (SMS_LIVE + credentials), so in dev/CI no instance exists and no text is sent.
 */
export class TwilioSmsChannel implements DeliveryChannel {
  readonly kind: NotificationChannel = "sms";

  constructor(
    private readonly opts: {
      accountSid: string;
      authToken: string;
      from: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async send(
    to: ChannelRecipient,
    message: RenderedMessage,
  ): Promise<{ providerMessageId?: string }> {
    if (!to.phone) {
      throw new Error(`No phone number for ${to.name}`);
    }
    const doFetch = this.opts.fetchImpl ?? fetch;
    const auth = Buffer.from(`${this.opts.accountSid}:${this.opts.authToken}`).toString("base64");
    const body = new URLSearchParams({
      From: this.opts.from,
      To: to.phone,
      Body: message.text,
    });

    const res = await doFetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.opts.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Twilio ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json().catch(() => ({}))) as { sid?: string };
    return { providerMessageId: json.sid };
  }
}
