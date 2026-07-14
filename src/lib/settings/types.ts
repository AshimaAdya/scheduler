/**
 * Shape of `businesses.settings` (jsonb). Approval mode and all tier wait-windows
 * are per-business config here — never hardcoded in application logic (invariant #4).
 */
export type ApprovalMode = "auto_publish" | "require_approval";

/** Triggers that run through the tiered broadcast and therefore have wait-windows. */
export type WindowedTrigger = "sick_call" | "day_off";

export type WaitWindow = {
  tier1_minutes: number;
  tier2_minutes: number;
};

export type NotificationChannelPref = "email" | "sms" | "both";

export type NotificationPrefs = {
  default_channel: NotificationChannelPref;
  from_name: string;
};

export type BusinessSettings = {
  approval_mode: ApprovalMode;
  timezone: string;
  wait_windows: Record<WindowedTrigger, WaitWindow>;
  notifications: NotificationPrefs;
};

/** Defaults (AC): require_approval on; sick_call 30 min/tier; day_off 24h/tier. */
export const DEFAULT_SETTINGS: BusinessSettings = {
  approval_mode: "require_approval",
  timezone: "America/Vancouver",
  wait_windows: {
    sick_call: { tier1_minutes: 30, tier2_minutes: 30 },
    day_off: { tier1_minutes: 1440, tier2_minutes: 1440 },
  },
  notifications: {
    default_channel: "both",
    from_name: "ShiftCover",
  },
};
