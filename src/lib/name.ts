/**
 * Display only a first name in employee-facing UI (privacy: never expose full
 * name lists of coworkers — Design direction v1 / invariant #3 spirit).
 */
export function firstName(fullName: string | null | undefined): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "A coworker";
  return trimmed.split(/\s+/)[0];
}
