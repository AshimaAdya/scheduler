import { type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { validateTwilioSignature } from "@/lib/notifications/channels/twilio-signature";
import { handleInboundSms } from "@/lib/notifications/inbound";

export const dynamic = "force-dynamic";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function twiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`;
}

/** The exact URL Twilio signed. Prefer an explicit override; else rebuild it. */
function webhookUrl(request: NextRequest): string {
  if (process.env.TWILIO_INBOUND_URL) return process.env.TWILIO_INBOUND_URL;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return `${proto}://${host}${new URL(request.url).pathname}`;
}

/**
 * Twilio inbound SMS webhook (SCH-27). Validates the request signature, then
 * matches the sender to their open cover offers and resolves a YES/NO reply,
 * responding with TwiML that Twilio delivers back to the employee.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return new Response("SMS not configured", { status: 500 });
  }

  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) params[key] = String(value);

  const signature = request.headers.get("x-twilio-signature");
  if (!validateTwilioSignature(authToken, webhookUrl(request), params, signature)) {
    return new Response("Invalid signature", { status: 403 });
  }

  const admin = createServiceRoleClient();
  const { reply } = await handleInboundSms(admin, {
    fromPhone: params.From ?? "",
    body: params.Body ?? "",
  });

  return new Response(twiml(reply), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
