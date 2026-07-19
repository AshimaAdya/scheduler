import { test, expect } from "@playwright/test";
import {
  cleanupWeek,
  createSchedule,
  createShift,
  assign,
  seedBroadcast,
  expireTierNow,
  requestState,
} from "./helpers/db";
import { runTierCron } from "./helpers/api";
import { nextSlot } from "./helpers/time";
import { EMP } from "./config";

const WEEK = "2027-06-07";

test.describe("day off with no responses escalates via the cron", () => {
  test.use({ storageState: "e2e/.auth/manager.json" });
  test.afterAll(() => cleanupWeek(WEEK));

  test("tier1 → tier2 → escalated, visible on the board", async ({ page, request }) => {
    const slot = nextSlot(2 /* Tue */, 9, 13);
    const scheduleId = await createSchedule(WEEK);
    const shiftId = await createShift(scheduleId, { startsAt: slot.startsAt, endsAt: slot.endsAt });
    await assign(shiftId, EMP.liam.id);
    // Already-expired tier-1 day-off broadcast (nobody replied).
    const requestId = await seedBroadcast({
      shiftId,
      reporterId: EMP.liam.id,
      trigger: "day_off",
      offerTo: [EMP.sofia.id],
      expiredMinutesAgo: 5,
    });

    // The cron is the clock: first sweep advances to tier2, second escalates.
    await runTierCron(request);
    expect((await requestState(requestId)).status).toBe("tier2_broadcast");

    await expireTierNow(requestId);
    await runTierCron(request);
    expect((await requestState(requestId)).status).toBe("escalated");

    // The manager board reflects it with employee-facing language (no "Tier N").
    await page.goto("/manage/coverage");
    await expect(page.getByText(/sent to a manager/i).first()).toBeVisible();
    await expect(page.getByText(/tier/i)).toHaveCount(0);
  });
});
