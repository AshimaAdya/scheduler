import { describe, it, expect } from "vitest";
import { sendWithRetry } from "./service";
import type { ChannelRecipient, DeliveryChannel, RenderedMessage } from "./channels/types";

const TO: ChannelRecipient = { employeeId: "e1", name: "Sofia", email: "s@x.test", phone: null };
const MSG: RenderedMessage = { subject: "s", text: "t" };
const noBackoff = async () => {};

/** A channel that throws for the first `failTimes` attempts, then succeeds. */
function fakeChannel(failTimes: number) {
  const chan: DeliveryChannel & { attempts: number } = {
    kind: "email",
    attempts: 0,
    async send() {
      chan.attempts += 1;
      if (chan.attempts <= failTimes) throw new Error(`fail #${chan.attempts}`);
      return { providerMessageId: "ok-id" };
    },
  };
  return chan;
}

describe("sendWithRetry", () => {
  it("retries and succeeds within the attempt budget", async () => {
    const chan = fakeChannel(2); // fail twice, succeed on the 3rd
    const res = await sendWithRetry(chan, TO, MSG, { maxAttempts: 3, backoff: noBackoff });
    expect(res.providerMessageId).toBe("ok-id");
    expect(chan.attempts).toBe(3);
  });

  it("gives up after maxAttempts and throws the last error", async () => {
    const chan = fakeChannel(99); // never succeeds
    await expect(
      sendWithRetry(chan, TO, MSG, { maxAttempts: 3, backoff: noBackoff }),
    ).rejects.toThrow(/fail #3/);
    expect(chan.attempts).toBe(3);
  });
});
