"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  validateSettings,
  type SettingsFieldErrors,
  type SettingsInput,
} from "@/lib/settings/validate";

export type SettingsResult =
  | { ok: true }
  | { ok: false; error?: string; errors?: SettingsFieldErrors };

function readForm(formData: FormData): Partial<SettingsInput> {
  return {
    approval_mode: String(formData.get("approval_mode") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    sick_tier1: String(formData.get("sick_tier1") ?? ""),
    sick_tier2: String(formData.get("sick_tier2") ?? ""),
    dayoff_tier1: String(formData.get("dayoff_tier1") ?? ""),
    dayoff_tier2: String(formData.get("dayoff_tier2") ?? ""),
    notif_channel: String(formData.get("notif_channel") ?? ""),
    notif_from: String(formData.get("notif_from") ?? ""),
  };
}

export async function updateSettings(
  _prev: SettingsResult | null,
  formData: FormData,
): Promise<SettingsResult> {
  await requireManager();

  const parsed = validateSettings(readForm(formData));
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const businessId = String(formData.get("business_id") ?? "");
  if (!businessId) return { ok: false, error: "Missing business." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("businesses")
    .update({ settings: parsed.settings })
    .eq("id", businessId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/manage/settings");
  return { ok: true };
}
