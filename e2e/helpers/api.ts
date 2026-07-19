import type { APIRequestContext, APIResponse } from "@playwright/test";
import { computeTwilioSignature } from "../../src/lib/notifications/channels/twilio-signature";
import { APP_URL, CRON_SECRET, INBOUND_URL, TWILIO_AUTH_TOKEN } from "../config";

/**
 * Simulate an inbound SMS reply (the app validates the Twilio signature). We sign
 * the exact URL the app validates against (`TWILIO_INBOUND_URL` set to INBOUND_URL
 * in the app env) so a real Twilio POST is faithfully reproduced.
 */
export async function postInboundSms(
  request: APIRequestContext,
  opts: { from: string; body: string },
): Promise<APIResponse> {
  const params: Record<string, string> = {
    From: opts.from,
    To: "+15550000000",
    Body: opts.body,
  };
  const signature = computeTwilioSignature(TWILIO_AUTH_TOKEN, INBOUND_URL, params);
  return request.post(`${APP_URL}/api/sms/inbound`, {
    headers: {
      "X-Twilio-Signature": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    form: params,
  });
}

/** Fire the tier-timer sweep (the cron's job) — the clock for escalation tests. */
export async function runTierCron(request: APIRequestContext): Promise<APIResponse> {
  return request.get(`${APP_URL}/api/cron/coverage-tiers`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
}
