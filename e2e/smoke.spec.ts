import { test, expect } from "@playwright/test";

/** The auth storageStates work and each role lands where it should. */
test.describe("employee session", () => {
  test.use({ storageState: "e2e/.auth/employee.json" });

  test("lands on the For-you feed", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /for you/i })).toBeVisible();
    // Bottom nav shell is present.
    await expect(page.getByRole("navigation", { name: /primary/i })).toBeVisible();
  });
});

test.describe("manager session", () => {
  test.use({ storageState: "e2e/.auth/manager.json" });

  test("can open the live coverage board", async ({ page }) => {
    await page.goto("/manage/coverage");
    await expect(page.getByRole("heading", { name: /cover requests/i })).toBeVisible();
  });
});
