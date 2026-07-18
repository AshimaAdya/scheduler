import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSettings } from "@/lib/settings/resolve";
import type { NotificationChannelPref } from "@/lib/settings/types";
import type { NotificationChannel, NotificationMessage, NotificationService } from "./types";
import type { ChannelRecipient, DeliveryChannel, RenderedMessage } from "./channels/types";
import { renderTemplate } from "./templates";
import { buildContext, loadShiftContexts, shiftIdsFromPayloads } from "./enrich";

export type RetryOptions = {
  maxAttempts?: number;
  /** Delay before the next attempt (injectable so tests run instantly). */
  backoff?: (attempt: number) => Promise<void>;
};

const defaultBackoff = (attempt: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, 200 * 2 ** attempt));

/** Try a channel up to `maxAttempts` times with backoff; throw the last error. */
export async function sendWithRetry(
  channel: DeliveryChannel,
  to: ChannelRecipient,
  message: RenderedMessage,
  opts: RetryOptions = {},
): Promise<{ providerMessageId?: string }> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoff = opts.backoff ?? defaultBackoff;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await channel.send(to, message);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts - 1) await backoff(attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function expandChannels(pref: NotificationChannelPref): NotificationChannel[] {
  return pref === "both" ? ["email", "sms"] : [pref];
}

type LogExtra = { providerMessageId?: string; error?: string };

/**
 * The real NotificationService: resolves the business channel preference and the
 * recipient's contact details, renders each template with real data, delivers via
 * the registered channels (with retry/backoff), and records every attempt in
 * `notifications_log`. Delivery failures are logged, never thrown — a failed text
 * must not roll back a confirmed cover.
 */
export class MultiChannelNotificationService implements NotificationService {
  private readonly channels: Map<NotificationChannel, DeliveryChannel>;
  private readonly retry?: RetryOptions;

  constructor(
    private readonly supabase: SupabaseClient,
    opts: { channels: DeliveryChannel[]; retry?: RetryOptions },
  ) {
    this.channels = new Map(opts.channels.map((c) => [c.kind, c]));
    this.retry = opts.retry;
  }

  async send(messages: NotificationMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const { data: business } = await this.supabase
      .from("businesses")
      .select("settings")
      .limit(1)
      .maybeSingle();
    const settings = resolveSettings(business?.settings);
    const targetKinds = expandChannels(settings.notifications.default_channel);
    const hasAnyChannel = targetKinds.some((k) => this.channels.has(k));

    const recipientIds = [...new Set(messages.map((m) => m.recipientEmployeeId))];
    const { data: emps } = recipientIds.length
      ? await this.supabase
          .from("employees")
          .select("id, full_name, email, phone")
          .in("id", recipientIds)
      : { data: [] };
    const empById = new Map((emps ?? []).map((e) => [e.id, e]));

    const shiftContexts = await loadShiftContexts(
      this.supabase,
      shiftIdsFromPayloads(messages.map((m) => m.payload)),
      settings.timezone,
    );

    for (const m of messages) {
      const emp = empById.get(m.recipientEmployeeId);
      const recipient: ChannelRecipient = {
        employeeId: m.recipientEmployeeId,
        name: emp?.full_name ?? "there",
        email: emp?.email ?? null,
        phone: emp?.phone ?? null,
      };
      const ctx = buildContext(
        m.payload,
        { recipientName: recipient.name, fromName: settings.notifications.from_name },
        shiftContexts,
      );
      const rendered = renderTemplate(m.template, ctx);

      for (const kind of targetKinds) {
        const channel = this.channels.get(kind);
        if (!channel) continue; // no delivery for this kind yet (e.g. SMS pre-SCH-26)
        try {
          const { providerMessageId } = await sendWithRetry(
            channel,
            recipient,
            rendered,
            this.retry,
          );
          await this.log(m, kind, "sent", { providerMessageId });
        } catch (error) {
          await this.log(m, kind, "failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Nothing could be delivered (no channel for any preferred kind) — still
      // record the intent so the audit trail is complete.
      if (!hasAnyChannel) {
        await this.log(m, targetKinds[0] ?? "email", "queued", {});
      }
    }
  }

  private async log(
    m: NotificationMessage,
    channel: NotificationChannel,
    status: "sent" | "failed" | "queued",
    extra: LogExtra,
  ): Promise<void> {
    await this.supabase.from("notifications_log").insert({
      recipient_employee_id: m.recipientEmployeeId,
      coverage_request_id: m.coverageRequestId ?? null,
      channel,
      template: m.template,
      status,
      provider: channel === "email" ? "resend" : null,
      provider_message_id: extra.providerMessageId ?? null,
      error: extra.error ?? null,
      payload: m.payload,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    });
  }
}
