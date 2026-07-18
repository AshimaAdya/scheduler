/**
 * Notification service delivery logging (SCH-25).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves the real service records each attempt in notifications_log: a success is
 * 'sent' with the provider id, a failure is 'failed' with the error (and send()
 * does NOT throw — a bad email must not break the caller), and with no channel
 * configured the intent is still recorded as 'queued'.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { MultiChannelNotificationService } from "@/lib/notifications/service";
import type { DeliveryChannel } from "@/lib/notifications/channels/types";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const LIAM = "20000000-0000-0000-0000-000000000004";
const T_OK = "test_notify_ok";
const T_FAIL = "test_notify_fail";
const T_QUEUED = "test_notify_queued";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function emailChannel(mode: "ok" | "fail"): DeliveryChannel {
  return {
    kind: "email",
    async send() {
      if (mode === "fail") throw new Error("smtp boom");
      return { providerMessageId: "prov-123" };
    },
  };
}

async function rowFor(template: string) {
  const { data } = await admin
    .from("notifications_log")
    .select("status, channel, provider, provider_message_id, error")
    .eq("template", template)
    .eq("recipient_employee_id", LIAM)
    .limit(1)
    .maybeSingle();
  return data;
}

afterEach(async () => {
  await admin.from("notifications_log").delete().in("template", [T_OK, T_FAIL, T_QUEUED]);
});

describe("MultiChannelNotificationService", () => {
  it("records a successful email as sent, with the provider id", async () => {
    const svc = new MultiChannelNotificationService(admin, {
      channels: [emailChannel("ok")],
      retry: { maxAttempts: 2, backoff: async () => {} },
    });
    await svc.send([{ recipientEmployeeId: LIAM, template: T_OK, payload: {} }]);

    expect(await rowFor(T_OK)).toMatchObject({
      status: "sent",
      channel: "email",
      provider: "resend",
      provider_message_id: "prov-123",
    });
  });

  it("records a failed send with the error and never throws", async () => {
    const svc = new MultiChannelNotificationService(admin, {
      channels: [emailChannel("fail")],
      retry: { maxAttempts: 2, backoff: async () => {} },
    });
    // Must resolve, not reject.
    await svc.send([{ recipientEmployeeId: LIAM, template: T_FAIL, payload: {} }]);

    const row = await rowFor(T_FAIL);
    expect(row?.status).toBe("failed");
    expect(row?.error).toContain("smtp boom");
  });

  it("records intent as queued when no channel is configured", async () => {
    const svc = new MultiChannelNotificationService(admin, { channels: [] });
    await svc.send([{ recipientEmployeeId: LIAM, template: T_QUEUED, payload: {} }]);

    expect(await rowFor(T_QUEUED)).toMatchObject({ status: "queued", channel: "email" });
  });
});
