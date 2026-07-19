import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio request-signature validation (X-Twilio-Signature). Twilio signs the
 * exact webhook URL followed by every POST param appended as key+value in
 * alphabetical key order, HMAC-SHA1 with the account auth token, base64. Any
 * mismatch means a forged (or misconfigured) request — reject it.
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null | undefined,
): boolean {
  if (!signature) return false;
  const expected = computeTwilioSignature(authToken, url, params);
  const a = Buffer.from(expected, "utf-8");
  const b = Buffer.from(signature, "utf-8");
  return a.length === b.length && timingSafeEqual(a, b);
}
