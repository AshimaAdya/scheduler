import { validateEmployee, type EmployeeDraft } from "@/lib/validation/employee";

/** Column order of the import template. */
export const CSV_HEADERS = [
  "name",
  "email",
  "phone",
  "role",
  "skills",
  "max_weekly_hours",
  "home_location",
] as const;

/** Downloadable template: header row + one example. */
export const TEMPLATE_CSV = `${CSV_HEADERS.join(",")}
Jordan Tse,jordan@example.com,+16045551234,employee,"barista, cashier",32,Gastown
`;

/**
 * Minimal RFC-4180 CSV parser: comma-separated, double-quoted fields may contain
 * commas and newlines, and "" is an escaped quote. Returns rows of string fields.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export type ImportRowStatus = "ok" | "duplicate" | "error";

export type ImportRow = {
  line: number; // 1-based line in the file
  name: string;
  email: string;
  status: ImportRowStatus;
  errors?: string[];
  data?: EmployeeDraft;
};

export type ImportPlan = {
  rows: ImportRow[];
  counts: { ok: number; duplicate: number; error: number };
};

function isBlankRow(fields: string[]): boolean {
  return fields.every((f) => f.trim() === "");
}

/**
 * Parse + validate a CSV against known locations (by name) and already-existing
 * emails. Malformed rows are reported with their line number and never abort the
 * valid rows; duplicate emails (in-file or already in the DB) are flagged to skip.
 */
export function processEmployeeCsv(
  text: string,
  locations: { id: string; name: string }[],
  existingEmails: string[],
): ImportPlan {
  const rows: ImportRow[] = [];
  const parsed = parseCsv(text);

  const locationByName = new Map(
    locations.map((l) => [l.name.trim().toLowerCase(), l.id]),
  );
  const seenEmails = new Set(existingEmails.map((e) => e.trim().toLowerCase()));

  // Map header names → column index (order-independent, case-insensitive).
  const header = (parsed[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);

  for (let r = 1; r < parsed.length; r++) {
    const fields = parsed[r];
    if (isBlankRow(fields)) continue;
    const line = r + 1; // 1-based, header is line 1

    const cell = (name: string) => {
      const i = col(name);
      return i >= 0 ? (fields[i] ?? "").trim() : "";
    };

    const name = cell("name");
    const email = cell("email").toLowerCase();
    const homeName = cell("home_location");

    // Resolve home location by name (blank is allowed).
    let homeLocationId = "";
    const errors: string[] = [];
    if (homeName) {
      const id = locationByName.get(homeName.toLowerCase());
      if (!id) errors.push(`Unknown location "${homeName}".`);
      else homeLocationId = id;
    }

    const parsedRow = validateEmployee({
      full_name: name,
      email,
      phone: cell("phone"),
      role: cell("role") || "employee",
      skills: cell("skills"),
      max_weekly_hours: cell("max_weekly_hours"),
      home_location_id: homeLocationId,
    });

    if (!parsedRow.ok) {
      errors.push(...Object.values(parsedRow.errors));
    }

    if (errors.length > 0) {
      rows.push({ line, name, email, status: "error", errors });
      continue;
    }

    if (seenEmails.has(email)) {
      rows.push({ line, name, email, status: "duplicate" });
      continue;
    }

    seenEmails.add(email);
    rows.push({ line, name, email, status: "ok", data: parsedRow.ok ? parsedRow.data : undefined });
  }

  const counts = { ok: 0, duplicate: 0, error: 0 };
  for (const row of rows) counts[row.status]++;

  return { rows, counts };
}
