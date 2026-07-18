/**
 * Provider-agnostic notification contract. The real service (SCH-25) renders each
 * template and delivers via registered channels (Resend email now, Twilio SMS in
 * SCH-26), recording every attempt in `notifications_log`. A logging stub also
 * implements this for tests.
 */
export type NotificationChannel = "email" | "sms";

export type NotificationMessage = {
  recipientEmployeeId: string;
  /**
   * @deprecated Ignored for routing since SCH-25 — the service delivers on every
   * channel in `businesses.settings.notifications.default_channel`. Kept optional
   * so existing callers still compile.
   */
  channel?: NotificationChannel;
  /** Template identifier, e.g. "schedule_published". */
  template: string;
  /** Context for rendering + the audit-trail snapshot. */
  payload: Record<string, unknown>;
  coverageRequestId?: string;
};

export interface NotificationService {
  /** Deliver (and log) a batch of notifications. */
  send(messages: NotificationMessage[]): Promise<void>;
}
