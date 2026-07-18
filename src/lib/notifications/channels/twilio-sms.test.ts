import { describe, it, expect, vi } from "vitest";
import { TwilioSmsChannel } from "./twilio-sms";
import type { ChannelRecipient, RenderedMessage } from "./types";

const MSG: RenderedMessage = { subject: "unused for sms", text: "Reply YES to take it, NO to pass." };
const withPhone: ChannelRecipient = { employeeId: "e", name: "Sofia", email: null, phone: "+16045550101" };

function okFetch() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }),
  ) as unknown as typeof fetch;
}

describe("TwilioSmsChannel", () => {
  it("posts To/Body with basic auth and returns the message sid", async () => {
    const fetchImpl = okFetch();
    const chan = new TwilioSmsChannel({
      accountSid: "AC1",
      authToken: "tok",
      from: "+15550000000",
      fetchImpl,
    });

    const res = await chan.send(withPhone, MSG);
    expect(res.providerMessageId).toBe("SM123");

    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toContain("/Accounts/AC1/Messages.json");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("To")).toBe("+16045550101");
    expect(body.get("From")).toBe("+15550000000");
    expect(body.get("Body")).toContain("Reply YES");
  });

  it("throws when the recipient has no phone", async () => {
    const chan = new TwilioSmsChannel({ accountSid: "AC1", authToken: "t", from: "+1", fetchImpl: okFetch() });
    await expect(
      chan.send({ employeeId: "e", name: "No Phone", email: null, phone: null }, MSG),
    ).rejects.toThrow(/no phone/i);
  });

  it("throws on a non-2xx Twilio response", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response("bad", { status: 400 }),
    ) as unknown as typeof fetch;
    const chan = new TwilioSmsChannel({ accountSid: "AC1", authToken: "t", from: "+1", fetchImpl });
    await expect(chan.send(withPhone, MSG)).rejects.toThrow(/Twilio 400/);
  });
});
