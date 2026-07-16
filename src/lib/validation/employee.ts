import { normalizeToE164 } from "@/lib/phone";
import type { AppRole } from "@/lib/auth/routes";

/** Raw form values (all strings, as they arrive from a FormData submit). */
export type EmployeeInput = {
  full_name: string;
  email: string;
  phone: string;
  role: string;
  skills: string; // comma-separated
  max_weekly_hours: string;
  home_location_id: string;
};

/** Cleaned, typed values ready to write to the employees table. */
export type EmployeeDraft = {
  full_name: string;
  email: string;
  phone: string | null;
  role: AppRole;
  skills: string[];
  max_weekly_hours: number;
  home_location_id: string | null;
};

export type FieldErrors = Partial<Record<keyof EmployeeInput, string>>;

export type ValidationResult =
  | { ok: true; data: EmployeeDraft }
  | { ok: false; errors: FieldErrors };

const ROLES: AppRole[] = ["employee", "manager", "admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse "barista, Cashier ,barista" → ["barista","cashier"] (trimmed, lowercased, deduped). */
export function parseSkills(raw: string): string[] {
  const seen = new Set<string>();
  for (const s of raw.split(",")) {
    const skill = s.trim().toLowerCase();
    if (skill) seen.add(skill);
  }
  return [...seen];
}

export function validateEmployee(
  input: Partial<EmployeeInput>,
): ValidationResult {
  const errors: FieldErrors = {};

  const full_name = (input.full_name ?? "").trim();
  if (!full_name) errors.full_name = "Enter a name.";

  const email = (input.email ?? "").trim().toLowerCase();
  if (!email) errors.email = "Enter a work email.";
  else if (!EMAIL.test(email)) errors.email = "Enter a valid email address.";

  const role = (input.role ?? "employee").trim();
  if (!ROLES.includes(role as AppRole)) errors.role = "Choose a role.";

  // Phone is optional at creation, but if given it must normalize to E.164.
  let phone: string | null = null;
  const phoneRaw = (input.phone ?? "").trim();
  if (phoneRaw) {
    const result = normalizeToE164(phoneRaw);
    if (!result.ok) errors.phone = result.error;
    else phone = result.e164;
  }

  let max_weekly_hours = 40;
  const hoursRaw = (input.max_weekly_hours ?? "").trim();
  if (hoursRaw) {
    const n = Number(hoursRaw);
    if (!Number.isFinite(n) || n < 0 || n > 168) {
      errors.max_weekly_hours = "Enter hours between 0 and 168.";
    } else {
      max_weekly_hours = n;
    }
  }

  const skills = parseSkills(input.skills ?? "");
  const home_location_id = (input.home_location_id ?? "").trim() || null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      full_name,
      email,
      phone,
      role: role as AppRole,
      skills,
      max_weekly_hours,
      home_location_id,
    },
  };
}
