import { fromZonedTime } from "date-fns-tz";

/**
 * A per-location weekly demand template (a row of `shift_templates`).
 * Times are naive wall-clock "HH:MM"(:SS) in the business timezone.
 */
export type ShiftTemplate = {
  id: string;
  location_id: string;
  weekday: number; // 0 = Sunday … 6 = Saturday
  start_time: string;
  end_time: string;
  required_skill: string;
  headcount: number;
};

/** A concrete single-seat shift slot with UTC instants. */
export type GeneratedSlot = {
  template_id: string;
  location_id: string;
  required_skill: string;
  starts_at: Date; // UTC
  ends_at: Date; // UTC
  seat: number; // 1 … headcount
};

/** Add whole days to a "YYYY-MM-DD" date without any timezone drift. */
function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Normalize "H:M" / "HH:MM" / "HH:MM:SS" to "HH:MM:SS". */
function toHHMMSS(time: string): string {
  const [h = "0", m = "0", s = "0"] = time.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
}

/**
 * Days from the week's Monday to a given weekday (0=Sun..6=Sat).
 * The week starts Monday, matching `schedules.week_start`.
 */
function offsetFromMonday(weekday: number): number {
  return (weekday - 1 + 7) % 7;
}

/**
 * Expand active shift templates into concrete shift slots for the week beginning
 * `weekStart` (a Monday, "YYYY-MM-DD") in the IANA `timezone`.
 *
 * Each template's wall-clock time on its weekday is converted to a UTC instant
 * with DST handled by date-fns-tz — so a 09:00 shift is 09:00 *local* whether the
 * week is in standard or daylight time. `headcount` is expanded into one slot per
 * seat (matching the single-seat `shifts` model). Only templates with headcount
 * >= 1 produce slots.
 */
export function generateWeekSlots(
  templates: ShiftTemplate[],
  weekStart: string,
  timezone: string,
): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];

  for (const t of templates) {
    const dateStr = addDaysISO(weekStart, offsetFromMonday(t.weekday));
    const startsAt = fromZonedTime(
      `${dateStr}T${toHHMMSS(t.start_time)}`,
      timezone,
    );
    const endsAt = fromZonedTime(`${dateStr}T${toHHMMSS(t.end_time)}`, timezone);

    for (let seat = 1; seat <= t.headcount; seat++) {
      slots.push({
        template_id: t.id,
        location_id: t.location_id,
        required_skill: t.required_skill,
        starts_at: startsAt,
        ends_at: endsAt,
        seat,
      });
    }
  }

  return slots.sort((a, b) => a.starts_at.getTime() - b.starts_at.getTime());
}
