import {
  DEFAULT_SETTINGS,
  type BusinessSettings,
  type WaitWindow,
  type WindowedTrigger,
} from "./types";

/**
 * The wait-window for a trigger, read from business settings. This is the single
 * accessor the coverage engine (SCH-19+) uses to SNAPSHOT windows onto a coverage
 * request at creation time — so changing settings later never affects in-flight
 * requests. Falls back to defaults if a value is missing, so a malformed settings
 * blob can never crash request creation.
 */
export function waitWindowsFor(
  settings: Pick<BusinessSettings, "wait_windows">,
  trigger: WindowedTrigger,
): WaitWindow {
  const configured = settings.wait_windows?.[trigger];
  const fallback = DEFAULT_SETTINGS.wait_windows[trigger];
  return {
    tier1_minutes: configured?.tier1_minutes ?? fallback.tier1_minutes,
    tier2_minutes: configured?.tier2_minutes ?? fallback.tier2_minutes,
  };
}
