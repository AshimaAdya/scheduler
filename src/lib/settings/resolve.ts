import { DEFAULT_SETTINGS, type BusinessSettings } from "./types";

/**
 * Coerce a raw `businesses.settings` jsonb value into a complete BusinessSettings,
 * filling any missing field from defaults. Use this whenever reading settings so
 * older/partial blobs never produce undefined access.
 */
export function resolveSettings(raw: unknown): BusinessSettings {
  const r = (raw ?? {}) as Partial<BusinessSettings>;
  const ww = (r.wait_windows ?? {}) as Partial<BusinessSettings["wait_windows"]>;
  const notif = (r.notifications ?? {}) as Partial<
    BusinessSettings["notifications"]
  >;
  return {
    approval_mode: r.approval_mode ?? DEFAULT_SETTINGS.approval_mode,
    timezone: r.timezone ?? DEFAULT_SETTINGS.timezone,
    wait_windows: {
      sick_call: {
        ...DEFAULT_SETTINGS.wait_windows.sick_call,
        ...(ww.sick_call ?? {}),
      },
      day_off: {
        ...DEFAULT_SETTINGS.wait_windows.day_off,
        ...(ww.day_off ?? {}),
      },
    },
    notifications: {
      default_channel:
        notif.default_channel ?? DEFAULT_SETTINGS.notifications.default_channel,
      from_name: notif.from_name ?? DEFAULT_SETTINGS.notifications.from_name,
    },
  };
}
