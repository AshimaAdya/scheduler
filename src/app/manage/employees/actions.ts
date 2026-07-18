"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  validateEmployee,
  type EmployeeInput,
  type FieldErrors,
} from "@/lib/validation/employee";
import { sendEmployeeInvite } from "@/lib/employees/invite";

export type EmployeeResult =
  | { ok: true; message?: string }
  | { ok: false; error?: string; errors?: FieldErrors };

function readForm(formData: FormData): Partial<EmployeeInput> {
  return {
    full_name: String(formData.get("full_name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    role: String(formData.get("role") ?? "employee"),
    skills: String(formData.get("skills") ?? ""),
    max_weekly_hours: String(formData.get("max_weekly_hours") ?? ""),
    home_location_id: String(formData.get("home_location_id") ?? ""),
    notify_pref: String(formData.get("notify_pref") ?? "both"),
  };
}

/** Create an employee and email them an invite to set a password. */
export async function createEmployee(
  _prev: EmployeeResult | null,
  formData: FormData,
): Promise<EmployeeResult> {
  await requireManager();

  const parsed = validateEmployee(readForm(formData));
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const supabase = await createClient();
  const { data: employee, error } = await supabase
    .from("employees")
    .insert({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      role: parsed.data.role,
      skills: parsed.data.skills,
      max_weekly_hours: parsed.data.max_weekly_hours,
      home_location_id: parsed.data.home_location_id,
      notify_pref: parsed.data.notify_pref,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, errors: { email: "An employee with this email already exists." } };
    }
    return { ok: false, error: error.message };
  }

  // Auth-admin invite requires the service-role client.
  try {
    await sendEmployeeInvite(createServiceRoleClient(), parsed.data.email, employee.id);
  } catch (e) {
    return {
      ok: false,
      error: `Employee added, but the invite failed: ${(e as Error).message}. You can resend it from their profile.`,
    };
  }

  revalidatePath("/manage/employees");
  return { ok: true, message: "Employee added and invite sent." };
}

/** Edit an existing employee's details. */
export async function updateEmployee(
  _prev: EmployeeResult | null,
  formData: FormData,
): Promise<EmployeeResult> {
  await requireManager();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing employee." };

  const parsed = validateEmployee(readForm(formData));
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({
      full_name: parsed.data.full_name,
      email: parsed.data.email,
      phone: parsed.data.phone,
      role: parsed.data.role,
      skills: parsed.data.skills,
      max_weekly_hours: parsed.data.max_weekly_hours,
      home_location_id: parsed.data.home_location_id,
      notify_pref: parsed.data.notify_pref,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, errors: { email: "An employee with this email already exists." } };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/manage/employees");
  revalidatePath(`/manage/employees/${id}`);
  return { ok: true, message: "Changes saved." };
}

/** Deactivate or reactivate. We never hard-delete — history is kept. */
export async function setEmployeeActive(
  id: string,
  active: boolean,
): Promise<EmployeeResult> {
  await requireManager();
  if (!id) return { ok: false, error: "Missing employee." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/manage/employees");
  revalidatePath(`/manage/employees/${id}`);
  return { ok: true };
}
