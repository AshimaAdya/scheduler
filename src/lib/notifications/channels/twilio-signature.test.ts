import { describe, it, expect } from "vitest";
import { computeTwilioSignature, validateTwilioSignature } from "./twilio-signature";

const TOKEN = "twilio-auth-token";
const URL = "https://app.example.com/api/sms/inbound";
const PARAMS = { From: "+16045550108", To: "+15550000000", Body: "YES 2" };

describe("Twilio signature validation", () => {
  it("accepts a correctly signed request", () => {
    const sig = computeTwilioSignature(TOKEN, URL, PARAMS);
    expect(validateTwilioSignature(TOKEN, URL, PARAMS, sig)).toBe(true);
  });

  it("rejects a forged/mismatched signature", () => {
    expect(validateTwilioSignature(TOKEN, URL, PARAMS, "not-the-signature")).toBe(false);
  });

  it("rejects when any param was tampered with", () => {
    const sig = computeTwilioSignature(TOKEN, URL, PARAMS);
    expect(
      validateTwilioSignature(TOKEN, URL, { ...PARAMS, Body: "YES 1" }, sig),
    ).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(validateTwilioSignature(TOKEN, URL, PARAMS, null)).toBe(false);
  });
});
