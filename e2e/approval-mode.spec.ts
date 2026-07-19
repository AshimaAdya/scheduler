import { test, expect } from "@playwright/test";
import {
  cleanupWeek,
  createSchedule,
  createShift,
  assign,
  seedCoveredDayOff,
  setApprovalMode,
} from "./helpers/db";
import { nextSlot } from "./helpers/time";
import { EMP } from "./config";

const WEEK = "2027-07-05";

test.describe("approval-mode variants", () => {
  test.use({ storageState: "e2e/.auth/manager.json" });
  test.afterAll(async () => {
    await setApprovalMode("require_approval"); // restore the seed default
    await cleanupWeek(WEEK);
  });

  test("the day-off approve step appears only in require_approval mode", async ({ page }) => {
    const slot = nextSlot(2 /* Tue */, 9, 12);
    const scheduleId = await createSchedule(WEEK);
    const shiftId = await createShift(scheduleId, { startsAt: slot.startsAt, endsAt: slot.endsAt });
    await assign(shiftId, EMP.liam.id);
    await seedCoveredDayOff({ shiftId, reporterId: EMP.liam.id, coveredBy: EMP.emma.id });

    await setApprovalMode("require_approval");
    await page.goto("/manage/coverage");
    await expect(page.getByRole("button", { name: /approve day off/i })).toBeVisible();

    await setApprovalMode("auto_publish");
    await page.reload();
    await expect(page.getByRole("button", { name: /approve day off/i })).toHaveCount(0);
  });
});
