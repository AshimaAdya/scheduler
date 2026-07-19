import { chromium } from "@playwright/test";
import { admin } from "./helpers/db";
import { APP_URL, PASSWORD, USERS } from "./config";

/**
 * Global setup: give the seeded manager + employee a password (same bootstrap as
 * scripts/dev-login.mjs), then sign each in through the UI once and save the
 * session as storageState. Specs reuse those states instead of logging in every
 * test — fast and isolated per role.
 */
async function ensurePassword(email: string): Promise<void> {
  const { data: emp } = await admin
    .from("employees")
    .select("id, user_id")
    .eq("email", email)
    .single();

  if (emp!.user_id) {
    await admin.auth.admin.updateUserById(emp!.user_id, {
      password: PASSWORD,
      email_confirm: true,
    });
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    await admin.from("employees").update({ user_id: created.user!.id }).eq("id", emp!.id);
  }
}

async function saveState(email: string, path: string): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: APP_URL });
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  await page.context().storageState({ path });
  await browser.close();
}

export default async function globalSetup(): Promise<void> {
  await ensurePassword(USERS.manager.email);
  await ensurePassword(USERS.employee.email);
  await saveState(USERS.manager.email, "e2e/.auth/manager.json");
  await saveState(USERS.employee.email, "e2e/.auth/employee.json");
}
