import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationMessage, NotificationService } from "./types";

/**
 * Stub NotificationService for M2: it does not send anything, but records each
 * message to `notifications_log` (status 'queued') so the publish/broadcast flows
 * already leave an audit trail. Milestone 4 replaces the delivery with real
 * Resend/Twilio channels behind the same interface.
 *
 * Writing to notifications_log requires a service-role client (RLS restricts that
 * table's writes to service_role).
 */
export class LoggingNotificationService implements NotificationService {
  constructor(private readonly client: SupabaseClient) {}

  async send(messages: NotificationMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const rows = messages.map((m) => ({
      recipient_employee_id: m.recipientEmployeeId,
      coverage_request_id: m.coverageRequestId ?? null,
      channel: m.channel,
      template: m.template,
      status: "queued" as const,
      provider: null,
      payload: m.payload,
    }));

    const { error } = await this.client.from("notifications_log").insert(rows);
    if (error) throw new Error(error.message);
  }
}
