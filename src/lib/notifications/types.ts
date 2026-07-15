/**
 * Provider-agnostic notification contract. Real channels (Resend email, Twilio
 * SMS) arrive in Milestone 4 (SCH-25+); until then a logging stub implements this
 * and records every send to `notifications_log` so there's an audit trail.
 */
export type NotificationChannel = "email" | "sms";

export type NotificationMessage = {
  recipientEmployeeId: string;
  channel: NotificationChannel;
  /** Template identifier, e.g. "schedule_published". */
  template: string;
  /** Rendered content / context, stored for the audit trail. */
  payload: Record<string, unknown>;
  coverageRequestId?: string;
};

export interface NotificationService {
  /** Deliver (or, for the stub, log) a batch of notifications. */
  send(messages: NotificationMessage[]): Promise<void>;
}
