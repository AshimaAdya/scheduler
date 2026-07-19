import { test, expect } from "@playwright/test";
import {
  cleanupWeek,
  createSchedule,
  createShift,
  assign,
  seedBroadcast,
  requestState,
  assigneeOf,
} from "./helpers/db";
import { postInboundSms } from "./helpers/api";
import { nextSlot } from "./helpers/time";
import { EMP } from "./config";

const WEEK = "2027-06-14";

test.describe("sick-call cover claimed by an SMS reply", () => {
  test.use({ storageState: "e2e/.auth/manager.json" });
  test.afterAll(() => cleanupWeek(WEEK));

  test("YES → covered → shown on the manager board", async ({ page, request }) => {
    // Emma (Gastown barista) is available Tue 05:00–13:00; the shift sits inside it.
    const slot = nextSlot(2 /* Tue */, 9, 12);
    const scheduleId = await createSchedule(WEEK);
    const shiftId = await createShift(scheduleId, { startsAt: slot.startsAt, endsAt: slot.endsAt });
    await assign(shiftId, EMP.liam.id);
    const requestId = await seedBroadcast({
      shiftId,
      reporterId: EMP.liam.id,
      trigger: "sick_call",
      offerTo: [EMP.emma.id],
    });

    // Emma texts YES — the inbound webhook resolves it via the atomic claim.
    const res = await postInboundSms(request, { from: EMP.emma.phone, body: "YES" });
    expect(res.ok()).toBeTruthy();

    const state = await requestState(requestId);
    expect(state.status).toBe("covered");
    expect(state.covered_by).toBe(EMP.emma.id);
    expect(await assigneeOf(shiftId)).toBe(EMP.emma.id); // shift handed over

    await page.goto("/manage/coverage");
    await expect(page.getByText(/covered/i).first()).toBeVisible();
  });
});
