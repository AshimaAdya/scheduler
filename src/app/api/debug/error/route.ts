import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Deliberate error endpoint (SCH-31 AC) — hitting it throws so staging can
 * confirm the error reaches Sentry. It only errors when explicitly called; it is
 * not linked from anywhere.
 */
export function GET(): NextResponse {
  throw new Error("SCH-31: deliberate test error for Sentry");
}
