/**
 * Validation for recurring weekly availability.
 *
 * Times are wall-clock "HH:MM" strings in the business timezone (availability is
 * stored as naive `time`, not a UTC instant — see docs/schema.md). Lexical
 * comparison of zero-padded 24h strings is the same as chronological comparison,
 * so we compare them directly.
 */
export type TimeRange = {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export type RangeError = { index: number; message: string };

export type AvailabilityValidation =
  | { ok: true; ranges: TimeRange[] }
  | { ok: false; errors: RangeError[]; message: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function overlaps(a: TimeRange, b: TimeRange): boolean {
  // Touching endpoints (e.g. 09:00–12:00 and 12:00–15:00) do not overlap.
  return a.start < b.end && b.start < a.end;
}

export function validateWeeklyAvailability(
  ranges: TimeRange[],
): AvailabilityValidation {
  const errors: RangeError[] = [];

  ranges.forEach((r, i) => {
    if (!TIME.test(r.start) || !TIME.test(r.end)) {
      errors.push({ index: i, message: "Enter a valid time." });
    } else if (r.start >= r.end) {
      errors.push({ index: i, message: "End time must be after start time." });
    }
  });

  // Overlap check, per weekday, only among otherwise-valid ranges.
  const valid = ranges
    .map((r, i) => ({ r, i }))
    .filter(({ i }) => !errors.some((e) => e.index === i));

  for (let a = 0; a < valid.length; a++) {
    for (let b = a + 1; b < valid.length; b++) {
      if (
        valid[a].r.weekday === valid[b].r.weekday &&
        overlaps(valid[a].r, valid[b].r)
      ) {
        errors.push({
          index: valid[b].i,
          message: "This range overlaps another on the same day.",
        });
      }
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      message: "Please fix the highlighted time ranges.",
    };
  }
  return { ok: true, ranges };
}
