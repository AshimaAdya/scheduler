import { test, expect } from "@playwright/test";
import { formatInTimeZone } from "date-fns-tz";
import { cleanupWeek, createSchedule, createShift, assign } from "./helpers/db";
import { nextSlot, localLabel } from "./helpers/time";
import { EMP } from "./config";

const WEEK = "2027-06-28";

test.describe("timezone edge — shift near midnight", () => {
  test.use({ storageState: "e2e/.auth/employee.json" });
  test.afterAll(() => cleanupWeek(WEEK));

  test("a 23:00 local shift shows on its local day, not the UTC day", async ({ page }) => {
    // 23:00 local (America/Vancouver) is the NEXT calendar day in UTC — a classic
    // off-by-one. The app renders in business tz, so My schedule must show the
    // local day.
    const base = nextSlot(3 /* Wed */, 23, 23);
    const startsAt = base.startsAt;
    const endsAt = new Date(new Date(startsAt).getTime() + 60 * 60_000).toISOString(); // → 00:00 next local day

    const scheduleId = await createSchedule(WEEK);
    const shiftId = await createShift(scheduleId, { startsAt, endsAt });
    await assign(shiftId, EMP.liam.id);

    const localDay = localLabel(startsAt, "EEE MMM d"); //     business-tz day
    const utcDay = formatInTimeZone(new Date(startsAt), "UTC", "EEE MMM d"); // the wrong day
    expect(utcDay).not.toBe(localDay); // 23:00 PST really is the next UTC day

    await page.goto("/schedule");
    await expect(page.getByText(localDay).first()).toBeVisible();
  });
});
