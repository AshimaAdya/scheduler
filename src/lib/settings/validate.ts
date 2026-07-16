import {
  type ApprovalMode,
  type BusinessSettings,
  type NotificationChannelPref,
} from "./types";

/** Raw form values (all strings, as they arrive from a FormData submit). */
export type SettingsInput = {
  approval_mode: string;
  timezone: string;
  sick_tier1: string;
  sick_tier2: string;
  dayoff_tier1: string;
  dayoff_tier2: string;
  notif_channel: string;
  notif_from: string;
};

export type SettingsFieldErrors = Partial<Record<keyof SettingsInput, string>>;

export type SettingsValidation =
  | { ok: true; settings: BusinessSettings }
  | { ok: false; errors: SettingsFieldErrors };

const APPROVAL_MODES: ApprovalMode[] = ["auto_publish", "require_approval"];
const CHANNELS: NotificationChannelPref[] = ["email", "sms", "both"];

/** Parse a positive-integer minutes field; returns null if invalid. */
function parseMinutes(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 100_000) return null;
  return n;
}

export function validateSettings(
  input: Partial<SettingsInput>,
): SettingsValidation {
  const errors: SettingsFieldErrors = {};

  const approval_mode = (input.approval_mode ?? "").trim();
  if (!APPROVAL_MODES.includes(approval_mode as ApprovalMode)) {
    errors.approval_mode = "Choose an approval mode.";
  }

  const timezone = (input.timezone ?? "").trim();
  if (!timezone) errors.timezone = "Choose a timezone.";

  const windowFields = {
    sick_tier1: parseMinutes(input.sick_tier1 ?? ""),
    sick_tier2: parseMinutes(input.sick_tier2 ?? ""),
    dayoff_tier1: parseMinutes(input.dayoff_tier1 ?? ""),
    dayoff_tier2: parseMinutes(input.dayoff_tier2 ?? ""),
  };
  (Object.keys(windowFields) as (keyof typeof windowFields)[]).forEach((k) => {
    if (windowFields[k] === null) errors[k] = "Enter a number of minutes (1 or more).";
  });

  const notif_channel = (input.notif_channel ?? "both").trim();
  if (!CHANNELS.includes(notif_channel as NotificationChannelPref)) {
    errors.notif_channel = "Choose a channel.";
  }
  const notif_from = (input.notif_from ?? "").trim();

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    settings: {
      approval_mode: approval_mode as ApprovalMode,
      timezone,
      wait_windows: {
        sick_call: {
          tier1_minutes: windowFields.sick_tier1!,
          tier2_minutes: windowFields.sick_tier2!,
        },
        day_off: {
          tier1_minutes: windowFields.dayoff_tier1!,
          tier2_minutes: windowFields.dayoff_tier2!,
        },
      },
      notifications: {
        default_channel: notif_channel as NotificationChannelPref,
        from_name: notif_from || "ShiftCover",
      },
    },
  };
}
