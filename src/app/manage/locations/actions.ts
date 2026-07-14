"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type LocationResult = { ok: true } | { ok: false; error: string };

export async function createLocation(
  _prev: LocationResult | null,
  formData: FormData,
): Promise<LocationResult> {
  await requireManager();

  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  if (!name) return { ok: false, error: "Enter a location name." };

  const supabase = await createClient();
  const { error } = await supabase.from("locations").insert({ name, address });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/manage/locations");
  return { ok: true };
}

export async function updateLocation(
  _prev: LocationResult | null,
  formData: FormData,
): Promise<LocationResult> {
  await requireManager();

  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const address = String(formData.get("address") ?? "").trim() || null;
  if (!id) return { ok: false, error: "Missing location." };
  if (!name) return { ok: false, error: "Enter a location name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("locations")
    .update({ name, address })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/manage/locations");
  return { ok: true };
}
