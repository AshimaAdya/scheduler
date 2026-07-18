import { describe, it, expect, vi, afterEach } from "vitest";
import { buildChannels } from "./factory";

const kinds = () => buildChannels().map((c) => c.kind);

afterEach(() => vi.unstubAllEnvs());

describe("buildChannels env gating (dev never texts real staff)", () => {
  it("registers NO sms channel without SMS_LIVE, even with Twilio creds", () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550000000");
    vi.stubEnv("SMS_LIVE", "");
    expect(kinds()).not.toContain("sms");
  });

  it("registers the sms channel only when SMS_LIVE=true and creds are present", () => {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC1");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "tok");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15550000000");
    vi.stubEnv("SMS_LIVE", "true");
    expect(kinds()).toContain("sms");
  });

  it("does not register sms when SMS_LIVE=true but creds are missing", () => {
    vi.stubEnv("SMS_LIVE", "true");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "");
    expect(kinds()).not.toContain("sms");
  });
});
