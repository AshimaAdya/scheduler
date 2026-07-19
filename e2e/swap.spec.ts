import { test, expect } from "@playwright/test";
import {
  cleanupWeek,
  createSchedule,
  createShift,
  assign,
  seedSwap,
  assigneeOf,
} from "./helpers/db";
import { nextSlot } from "./helpers/time";
import { EMP } from "./config";

const WEEK = "2027-06-21";

test.describe("direct swap accepted inline swaps both assignments", () => {
  test.use({ storageState: "e2e/.auth/employee.json" }); // Liam is the target (B)
  test.afterAll(() => cleanupWeek(WEEK));

  test("B accepts on the feed → both shifts change hands", async ({ page }) => {
    // A = Emma. A's shift is Thu 16–19 (Liam is free then); B = Liam. B's shift is
    // Tue 09–12 (Emma is free then). Both baristas, no overlap.
    const aSlot = nextSlot(4 /* Thu */, 16, 19);
    const bSlot = nextSlot(2 /* Tue */, 9, 12);
    const scheduleId = await createSchedule(WEEK);
    const aShift = await createShift(scheduleId, { startsAt: aSlot.startsAt, endsAt: aSlot.endsAt });
    const bShift = await createShift(scheduleId, { startsAt: bSlot.startsAt, endsAt: bSlot.endsAt });
    await assign(aShift, EMP.emma.id);
    await assign(bShift, EMP.liam.id);
    await seedSwap({
      aShiftId: aShift,
      bShiftId: bShift,
      requesterId: EMP.emma.id,
      targetId: EMP.liam.id,
    });

    await page.goto("/");
    await expect(page.getByRole("heading", { name: /needs your reply/i })).toBeVisible();
    await page.getByRole("button", { name: /^accept$/i }).first().click();

    await expect(async () => {
      expect(await assigneeOf(aShift)).toBe(EMP.liam.id);
      expect(await assigneeOf(bShift)).toBe(EMP.emma.id);
    }).toPass({ timeout: 10_000 });
  });
});
