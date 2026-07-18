/**
 * Per-employee channel preference (SCH-26).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * With both a fake email and a fake sms channel registered, the service delivers
 * on exactly the channels in the recipient's notify_pref: 'email' → email only,
 * 'sms' → sms only (logged with provider 'twilio'), 'both' → both. Uses Sam (00c,
 * inactive, not a recipient in any other test) so mutating notify_pref is safe.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { MultiChannelNotificationService } from "@/lib/notifications/service";
import type { DeliveryChannel, NotificationChannel } from "@/lib/notifications/channels/types";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const SAM = "20000000-0000-0000-0000-00000000000c";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fakeChannel = (kind: NotificationChannel): DeliveryChannel => ({
  kind,
  async send() {
    return { providerMessageId: `${kind}-id` };
  },
});

function service() {
  return new MultiChannelNotificationService(admin, {
    channels: [fakeChannel("email"), fakeChannel("sms")],
    retry: { maxAttempts: 1, backoff: async () => {} },
  });
}

async function channelsLogged(template: string): Promise<string[]> {
  const { data } = await admin
    .from("notifications_log")
    .select("channel")
    .eq("template", template)
    .eq("recipient_employee_id", SAM);
  return (data ?? []).map((r) => r.channel).sort();
}

async function setPref(pref: "email" | "sms" | "both") {
  await admin.from("employees").update({ notify_pref: pref }).eq("id", SAM);
}

afterEach(async () => {
  await admin
    .from("notifications_log")
    .delete()
    .in("template", ["test_pref_email", "test_pref_sms", "test_pref_both"]);
  await admin.from("employees").update({ notify_pref: "both" }).eq("id", SAM);
});

describe("per-employee notify_pref routing", () => {
  it("delivers email only when the preference is email", async () => {
    await setPref("email");
    await service().send([{ recipientEmployeeId: SAM, template: "test_pref_email", payload: {} }]);
    expect(await channelsLogged("test_pref_email")).toEqual(["email"]);
  });

  it("delivers sms only (provider twilio) when the preference is sms", async () => {
    await setPref("sms");
    await service().send([{ recipientEmployeeId: SAM, template: "test_pref_sms", payload: {} }]);
    expect(await channelsLogged("test_pref_sms")).toEqual(["sms"]);

    const { data } = await admin
      .from("notifications_log")
      .select("provider, status")
      .eq("template", "test_pref_sms")
      .eq("recipient_employee_id", SAM)
      .single();
    expect(data).toMatchObject({ provider: "twilio", status: "sent" });
  });

  it("delivers on both channels when the preference is both", async () => {
    await setPref("both");
    await service().send([{ recipientEmployeeId: SAM, template: "test_pref_both", payload: {} }]);
    expect(await channelsLogged("test_pref_both")).toEqual(["email", "sms"]);
  });
});
