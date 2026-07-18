import type { NotificationChannel } from "../types";

/** A rendered message ready to hand to a delivery channel. */
export type RenderedMessage = {
  subject: string;
  text: string;
  html?: string;
};

/** The contact details a channel needs to deliver to one person. */
export type ChannelRecipient = {
  employeeId: string;
  name: string;
  email: string | null;
  phone: string | null;
};

/**
 * A provider-agnostic delivery channel (email via Resend now, SMS via Twilio in
 * SCH-26). Keeping this tiny is what lets a new channel plug into the service
 * registry without any caller changes.
 *
 * `send` resolves with the provider's message id on success and THROWS on failure
 * so the service can retry with backoff and, if it ultimately fails, log it.
 */
export interface DeliveryChannel {
  readonly kind: NotificationChannel;
  send(to: ChannelRecipient, message: RenderedMessage): Promise<{ providerMessageId?: string }>;
}
