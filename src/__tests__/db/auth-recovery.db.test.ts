/**
 * Password-reset (recovery) flow test.
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves: an existing user can reset via the recovery link
 * (generateLink recovery → verifyOtp → updateUser), sign in with the new
 * password, and that the server enforces the 8-character minimum.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const API_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const EMAIL = "olivia@harbourcoffee.test"; // seeded employee
const EMPLOYEE_ID = "20000000-0000-0000-0000-000000000009";
const OLD_PASSWORD = "OldPassword123";
const NEW_PASSWORD = "NewPassword456";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function anonClient() {
  return createClient(API_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let userId: string;

beforeAll(async () => {
  // Clean any leftover, then create a confirmed user with a known password.
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list.users.find((u) => u.email === EMAIL);
  if (existing) await admin.auth.admin.deleteUser(existing.id);

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: OLD_PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("no user");
  userId = data.user.id;
  await admin.from("employees").update({ user_id: userId }).eq("id", EMPLOYEE_ID);
});

afterAll(async () => {
  await admin.from("employees").update({ user_id: null }).eq("id", EMPLOYEE_ID);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("password reset (recovery)", () => {
  it("lets a user set a new password via the recovery link and sign in with it", async () => {
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: EMAIL,
    });
    expect(error).toBeNull();

    const client = anonClient();
    const { error: otpErr } = await client.auth.verifyOtp({
      type: "recovery",
      token_hash: link!.properties!.hashed_token,
    });
    expect(otpErr).toBeNull();

    const { error: updErr } = await client.auth.updateUser({
      password: NEW_PASSWORD,
    });
    expect(updErr).toBeNull();

    const fresh = anonClient();
    const { data: signIn, error: signInErr } =
      await fresh.auth.signInWithPassword({
        email: EMAIL,
        password: NEW_PASSWORD,
      });
    expect(signInErr).toBeNull();
    expect(signIn.user?.id).toBe(userId);
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      password: "short7!",
    });
    expect(error).not.toBeNull();
  });
});
