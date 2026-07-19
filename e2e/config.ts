/**
 * Shared E2E configuration. Values default to the local Supabase + a set of test
 * secrets; CI sets the same env for the app under test and for these helpers so
 * signed webhook / cron calls line up. `SMS_LIVE` is never set, so no real texts.
 */
export const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Must match the running app's env (set identically in CI + the webServer).
export const CRON_SECRET = process.env.CRON_SECRET ?? "e2e-cron-secret";
export const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "e2e-twilio-token";
export const INBOUND_URL = process.env.TWILIO_INBOUND_URL ?? `${APP_URL}/api/sms/inbound`;

export const BUSINESS_TZ = "America/Vancouver";
export const PASSWORD = "Password123!";

/** Seeded people we drive in the flows (ids/phones from supabase/seed.sql). */
export const USERS = {
  manager: { email: "marcus@harbourcoffee.test", role: "manager" },
  employee: { email: "liam@harbourcoffee.test", role: "employee" },
};

export const EMP = {
  liam: { id: "20000000-0000-0000-0000-000000000004", phone: "+16045550104" },
  sofia: { id: "20000000-0000-0000-0000-000000000005", phone: "+16045550105" },
  noah: { id: "20000000-0000-0000-0000-000000000006", phone: "+16045550106" },
  emma: { id: "20000000-0000-0000-0000-000000000007", phone: "+16045550107" },
  aiden: { id: "20000000-0000-0000-0000-000000000008", phone: "+16045550108" },
  maya: { id: "20000000-0000-0000-0000-00000000000b", phone: "+16045550111" },
};

export const GASTOWN = "10000000-0000-0000-0000-000000000001";
