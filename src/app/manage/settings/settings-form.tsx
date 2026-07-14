"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, SelectField } from "@/components/ui/field";
import { strings } from "@/lib/strings";
import type { BusinessSettings } from "@/lib/settings/types";
import { updateSettings, type SettingsResult } from "./actions";

const TIMEZONES = [
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Toronto",
  "America/Halifax",
  "America/St_Johns",
  "UTC",
];

export function SettingsForm({
  businessId,
  settings,
}: {
  businessId: string;
  settings: BusinessSettings;
}) {
  const [result, action, pending] = useActionState<SettingsResult | null, FormData>(
    updateSettings,
    null,
  );
  const errors = result && !result.ok ? result.errors : undefined;
  const s = strings.settings;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="business_id" value={businessId} />

      <SelectField
        label={s.approvalLabel}
        name="approval_mode"
        hint={s.approvalHint}
        defaultValue={settings.approval_mode}
        error={errors?.approval_mode}
      >
        <option value="require_approval">{s.approvalOn}</option>
        <option value="auto_publish">{s.approvalOff}</option>
      </SelectField>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={s.sickTier1}
          name="sick_tier1"
          type="number"
          min={1}
          defaultValue={settings.wait_windows.sick_call.tier1_minutes}
          error={errors?.sick_tier1}
        />
        <Field
          label={s.sickTier2}
          name="sick_tier2"
          type="number"
          min={1}
          defaultValue={settings.wait_windows.sick_call.tier2_minutes}
          error={errors?.sick_tier2}
        />
        <Field
          label={s.dayoffTier1}
          name="dayoff_tier1"
          type="number"
          min={1}
          defaultValue={settings.wait_windows.day_off.tier1_minutes}
          error={errors?.dayoff_tier1}
        />
        <Field
          label={s.dayoffTier2}
          name="dayoff_tier2"
          type="number"
          min={1}
          defaultValue={settings.wait_windows.day_off.tier2_minutes}
          error={errors?.dayoff_tier2}
        />
      </div>
      <p className="text-sm text-faint">{s.windowsNote}</p>

      <SelectField
        label={s.timezone}
        name="timezone"
        defaultValue={settings.timezone}
        error={errors?.timezone}
      >
        {TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </SelectField>

      <SelectField
        label={s.notifChannel}
        name="notif_channel"
        defaultValue={settings.notifications.default_channel}
        error={errors?.notif_channel}
      >
        <option value="both">{s.channels.both}</option>
        <option value="sms">{s.channels.sms}</option>
        <option value="email">{s.channels.email}</option>
      </SelectField>
      <Field
        label={s.notifFrom}
        name="notif_from"
        defaultValue={settings.notifications.from_name}
      />

      {result?.ok === true && <p className="text-sm text-ok">{s.saved}</p>}
      {result && !result.ok && result.error && (
        <p className="text-sm text-danger">{result.error}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : s.save}
        </Button>
      </div>
    </form>
  );
}
