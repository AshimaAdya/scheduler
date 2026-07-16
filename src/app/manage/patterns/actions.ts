"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type PatternResult = { ok: true } | { ok: false; error: string };

type Fields = {
  location_id: string;
  start_time: string;
  end_time: string;
  required_skill: string;
  headcount: number;
};

function readFields(formData: FormData): { fields?: Fields; error?: string } {
  const location_id = String(formData.get("location_id") ?? "").trim();
  const start_time = String(formData.get("start_time") ?? "").trim();
  const end_time = String(formData.get("end_time") ?? "").trim();
  const required_skill = String(formData.get("required_skill") ?? "")
    .trim()
    .toLowerCase();
  const headcount = Number(formData.get("headcount") ?? "1");

  if (!location_id) return { error: "Choose a location." };
  if (!start_time || !end_time) return { error: "Enter a start and end time." };
  if (start_time >= end_time) return { error: "End time must be after start time." };
  if (!required_skill) return { error: "Enter the skill needed." };
  if (!Number.isInteger(headcount) || headcount < 1) {
    return { error: "How many people must be 1 or more." };
  }
  return { fields: { location_id, start_time, end_time, required_skill, headcount } };
}

/** Create one template row per selected weekday (0=Sun..6=Sat). */
export async function createTemplates(
  _prev: PatternResult | null,
  formData: FormData,
): Promise<PatternResult> {
  await requireManager();

  const { fields, error } = readFields(formData);
  if (error || !fields) return { ok: false, error: error ?? "Invalid input." };

  const weekdays = formData
    .getAll("weekdays")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  if (weekdays.length === 0) return { ok: false, error: "Pick at least one day." };

  const rows = weekdays.map((weekday) => ({ ...fields, weekday }));

  const supabase = await createClient();
  const { error: insErr } = await supabase.from("shift_templates").insert(rows);
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/manage/patterns");
  return { ok: true };
}

export async function updateTemplate(
  _prev: PatternResult | null,
  formData: FormData,
): Promise<PatternResult> {
  await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing pattern." };

  const { fields, error } = readFields(formData);
  if (error || !fields) return { ok: false, error: error ?? "Invalid input." };

  const weekday = Number(formData.get("weekday") ?? "");
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return { ok: false, error: "Choose a day." };
  }

  const supabase = await createClient();
  const { error: updErr } = await supabase
    .from("shift_templates")
    .update({ ...fields, weekday })
    .eq("id", id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/manage/patterns");
  revalidatePath(`/manage/patterns/${id}`);
  return { ok: true };
}

export async function setTemplateActive(
  id: string,
  active: boolean,
): Promise<PatternResult> {
  await requireManager();
  if (!id) return { ok: false, error: "Missing pattern." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("shift_templates")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/manage/patterns");
  revalidatePath(`/manage/patterns/${id}`);
  return { ok: true };
}
