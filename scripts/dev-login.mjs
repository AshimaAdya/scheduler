/**
 * DEV-ONLY login bootstrap.
 *
 * Sets a password for a seeded employee so you can sign in during local
 * development, bypassing the invite email. This is the local equivalent of the
 * one-time "first admin" bootstrap you'd do in production (see
 * docs/production-setup.md) — it is NOT a way in for real deployments.
 *
 * Usage:
 *   npm run dev:login -- <email> <password>
 *   e.g. npm run dev:login -- ashima@harbourcoffee.test Password123!
 *
 * Refuses to run against anything that isn't a local Supabase URL.
 */
import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: npm run dev:login -- <email> <password>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (is .env.local set?).",
  );
  process.exit(1);
}

// Safety: never touch a real project.
const isLocal = url.includes("127.0.0.1") || url.includes("localhost");
if (!isLocal && process.env.FORCE_DEV_LOGIN !== "1") {
  console.error(
    `Refusing to run against a non-local Supabase URL (${url}). This script is for local dev only.`,
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: employee, error: empErr } = await admin
  .from("employees")
  .select("id, user_id, role, full_name")
  .eq("email", email)
  .maybeSingle();
if (empErr) throw empErr;
if (!employee) {
  console.error(`No employee found with email ${email}.`);
  process.exit(1);
}

if (employee.user_id) {
  // Existing auth user — just (re)set the password and confirm the email.
  const { error } = await admin.auth.admin.updateUserById(employee.user_id, {
    password,
    email_confirm: true,
  });
  if (error) throw error;
} else {
  // No auth user yet — create a confirmed one and link it to the employee.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const { error: linkErr } = await admin
    .from("employees")
    .update({ user_id: data.user.id })
    .eq("id", employee.id);
  if (linkErr) throw linkErr;
}

console.log(
  `✓ ${employee.full_name} (${email}, role: ${employee.role}) can now sign in at http://localhost:3000/login`,
);
