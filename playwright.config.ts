import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env.CI;
const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

// Test secrets shared with the app under test so signed webhook / cron calls line
// up. SMS_LIVE is intentionally absent, so no real texts are ever sent.
const appEnv = {
  CRON_SECRET: process.env.CRON_SECRET ?? "e2e-cron-secret",
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ?? "e2e-twilio-token",
  TWILIO_INBOUND_URL: process.env.TWILIO_INBOUND_URL ?? `${BASE_URL}/api/sms/inbound`,
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false, // specs share the single seeded business; run serially
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  workers: 1,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: CI ? "npm run start" : "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 120_000,
    env: appEnv,
  },
});
