import { describe, it, expect } from "vitest";
import { waitWindowsFor } from "./wait-windows";
import { validateSettings } from "./validate";
import { DEFAULT_SETTINGS } from "./types";

describe("waitWindowsFor", () => {
  it("returns the configured window for a trigger", () => {
    expect(waitWindowsFor(DEFAULT_SETTINGS, "sick_call")).toEqual({
      tier1_minutes: 30,
      tier2_minutes: 30,
    });
    expect(waitWindowsFor(DEFAULT_SETTINGS, "day_off")).toEqual({
      tier1_minutes: 1440,
      tier2_minutes: 1440,
    });
  });

  it("falls back to defaults when a value is missing", () => {
    // Malformed settings must not crash request creation.
    const partial = { wait_windows: { sick_call: {} } } as never;
    expect(waitWindowsFor(partial, "sick_call")).toEqual({
      tier1_minutes: 30,
      tier2_minutes: 30,
    });
  });
});

describe("validateSettings", () => {
  const valid = {
    approval_mode: "require_approval",
    timezone: "America/Vancouver",
    sick_tier1: "30",
    sick_tier2: "45",
    dayoff_tier1: "1440",
    dayoff_tier2: "2880",
    notif_channel: "both",
    notif_from: "Harbour Coffee",
  };

  it("accepts valid input and builds the settings object", () => {
    const result = validateSettings(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.approval_mode).toBe("require_approval");
      expect(result.settings.wait_windows.sick_call).toEqual({
        tier1_minutes: 30,
        tier2_minutes: 45,
      });
      expect(result.settings.wait_windows.day_off.tier2_minutes).toBe(2880);
      expect(result.settings.notifications.default_channel).toBe("both");
    }
  });

  it("rejects an invalid approval mode", () => {
    const result = validateSettings({ ...valid, approval_mode: "whenever" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.approval_mode).toBeDefined();
  });

  it("rejects non-positive or non-integer wait windows", () => {
    expect(validateSettings({ ...valid, sick_tier1: "0" }).ok).toBe(false);
    expect(validateSettings({ ...valid, sick_tier1: "-5" }).ok).toBe(false);
    expect(validateSettings({ ...valid, dayoff_tier2: "abc" }).ok).toBe(false);
    expect(validateSettings({ ...valid, sick_tier2: "1.5" }).ok).toBe(false);
  });

  it("defaults a blank sender name", () => {
    const result = validateSettings({ ...valid, notif_from: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.notifications.from_name).toBe("ShiftCover");
  });
});
