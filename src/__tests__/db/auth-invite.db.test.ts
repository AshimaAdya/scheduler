/**
 * Invite-flow + role-claim integration test (SCH-8).
 *
 * Runs against a live local Supabase:
 *   npx supabase start
 *   npm run test:db
 *
 * Proves the end-to-end invite path programmatically (without parsing email):
 *   generateLink(invite) → link employee → verifyOtp → set password → sign in,
 * and that the custom access token hook injects the correct `user_role` claim.
 *
 * Uses the service-role client for setup/teardown; idempotent and self-cleaning.
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

// Seeded employees (see supabase/seed.sql). Distinct from the RLS test's actors.
const EMMA = {
  id: "20000000-0000-0000-0000-000000000007",
  email: "emma@harbourcoffee.test",
  role: "employee",
};
const PRIYA = {
  id: "20000000-0000-0000-0000-000000000003",
  email: "priya@harbourcoffee.test",
  role: "manager",
};
const NEW_PASSWORD = "InviteFlowPass123!";

const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function anonClient() {
  return createClient(API_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Remove any auth user left over from a prior run so generateLink can recreate. */
async function purgeUser(email: string) {
  const { data } = await admin.auth.admin.listUsers();
  const existing = data.users.find((u) => u.email === email);
  if (existing) await admin.auth.admin.deleteUser(existing.id);
}

const createdUserIds: string[] = [];

beforeAll(async () => {
  await purgeUser(EMMA.email);
  await purgeUser(PRIYA.email);
});

afterAll(async () => {
  await admin
    .from("employees")
    .update({ user_id: null })
    .in("id", [EMMA.id, PRIYA.id]);
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("invite flow (end to end)", () => {
  it("invite → verify → set password → sign in works, and role claim is present", async () => {
    // 1. Generate an invite link (creates the invited auth user).
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email: EMMA.email,
    });
    expect(linkErr).toBeNull();
    const userId = link!.user!.id;
    createdUserIds.push(userId);

    // 2. Link the auth user to the employee record (as the invite action does).
    const { error: updErr } = await admin
      .from("employees")
      .update({ user_id: userId })
      .eq("id", EMMA.id);
    expect(updErr).toBeNull();

    // 3. Exchange the token for a session (what /auth/confirm does).
    const client = anonClient();
    const { error: otpErr } = await client.auth.verifyOtp({
      type: "invite",
      token_hash: link!.properties!.hashed_token,
    });
    expect(otpErr).toBeNull();

    // 4. Set the password (what /accept-invite does).
    const { error: pwErr } = await client.auth.updateUser({
      password: NEW_PASSWORD,
    });
    expect(pwErr).toBeNull();

    // 5. Sign in fresh with the new password.
    const fresh = anonClient();
    const { data: signIn, error: signInErr } =
      await fresh.auth.signInWithPassword({
        email: EMMA.email,
        password: NEW_PASSWORD,
      });
    expect(signInErr).toBeNull();
    expect(signIn.user?.id).toBe(userId);

    // 6. The custom access token hook put the employee role in the JWT.
    const { data: claims } = await fresh.auth.getClaims();
    expect(claims?.claims?.user_role).toBe(EMMA.role);
  });

  it("injects the manager role for a manager employee", async () => {
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "invite",
      email: PRIYA.email,
    });
    expect(error).toBeNull();
    const userId = link!.user!.id;
    createdUserIds.push(userId);

    await admin
      .from("employees")
      .update({ user_id: userId })
      .eq("id", PRIYA.id);

    const client = anonClient();
    const { error: otpErr } = await client.auth.verifyOtp({
      type: "invite",
      token_hash: link!.properties!.hashed_token,
    });
    expect(otpErr).toBeNull();

    const { data: claims } = await client.auth.getClaims();
    expect(claims?.claims?.user_role).toBe(PRIYA.role);
  });
});
