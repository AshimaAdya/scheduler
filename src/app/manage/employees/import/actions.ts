"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { sendEmployeeInvite } from "@/lib/employees/invite";
import { processEmployeeCsv, type ImportPlan } from "@/lib/employees/csv";

async function loadContext() {
  const supabase = await createClient();
  const [{ data: locations }, { data: employees }] = await Promise.all([
    supabase.from("locations").select("id, name"),
    supabase.from("employees").select("email"),
  ]);
  return {
    locations: locations ?? [],
    existingEmails: (employees ?? []).map((e) => e.email),
  };
}

export type PreviewResult =
  | { ok: true; plan: ImportPlan }
  | { ok: false; error: string };

export async function previewImport(csvText: string): Promise<PreviewResult> {
  await requireManager();
  if (!csvText.trim()) return { ok: false, error: "The file is empty." };

  const { locations, existingEmails } = await loadContext();
  return { ok: true, plan: processEmployeeCsv(csvText, locations, existingEmails) };
}

export type RunImportResult =
  | { ok: true; imported: number; skipped: number; failed: number; errors: string[] }
  | { ok: false; error: string };

export async function runImport(csvText: string): Promise<RunImportResult> {
  await requireManager();
  if (!csvText.trim()) return { ok: false, error: "The file is empty." };

  const { locations, existingEmails } = await loadContext();
  const plan = processEmployeeCsv(csvText, locations, existingEmails);

  const toImport = plan.rows.filter((r) => r.status === "ok" && r.data);
  const skipped = plan.counts.duplicate + plan.counts.error;
  if (toImport.length === 0) {
    return { ok: true, imported: 0, skipped, failed: 0, errors: [] };
  }

  const admin = createServiceRoleClient();
  let imported = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of toImport) {
    const d = row.data!;
    const { data: employee, error } = await admin
      .from("employees")
      .insert({
        full_name: d.full_name,
        email: d.email,
        phone: d.phone,
        role: d.role,
        skills: d.skills,
        max_weekly_hours: d.max_weekly_hours,
        home_location_id: d.home_location_id,
      })
      .select("id")
      .single();

    if (error || !employee) {
      failed++;
      errors.push(`Line ${row.line} (${d.email}): ${error?.message ?? "insert failed"}`);
      continue;
    }

    try {
      await sendEmployeeInvite(admin, d.email, employee.id);
      imported++;
    } catch (e) {
      // Employee was created but the invite failed — count as imported, note it.
      imported++;
      errors.push(`Line ${row.line} (${d.email}): invite failed — ${(e as Error).message}`);
    }
  }

  revalidatePath("/manage/employees");
  return { ok: true, imported, skipped, failed, errors };
}
