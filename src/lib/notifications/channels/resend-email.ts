import type { NotificationChannel } from "../types";
import type { ChannelRecipient, DeliveryChannel, RenderedMessage } from "./types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Email delivery via Resend, over `fetch` (no SDK dependency). Throws on a missing
 * recipient address or a non-2xx response so the service retries/records it.
 */
export class ResendEmailChannel implements DeliveryChannel {
  readonly kind: NotificationChannel = "email";

  constructor(
    private readonly opts: {
      apiKey: string;
      fromName: string;
      fromEmail: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async send(
    to: ChannelRecipient,
    message: RenderedMessage,
  ): Promise<{ providerMessageId?: string }> {
    if (!to.email) {
      throw new Error(`No email address for ${to.name}`);
    }
    const doFetch = this.opts.fetchImpl ?? fetch;
    const res = await doFetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${this.opts.fromName} <${this.opts.fromEmail}>`,
        to: [to.email],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Resend ${res.status}: ${detail.slice(0, 200)}`);
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { providerMessageId: body.id };
  }
}
