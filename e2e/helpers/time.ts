import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { BUSINESS_TZ } from "../config";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The next future occurrence (≥ 2 days out) of a given local weekday, at the given
 * local hours, returned as UTC instants + the local date. Lets specs place a shift
 * on a day/time the intended coverer is available in the business timezone.
 * `weekday`: 0=Sun … 6=Sat.
 */
export function nextSlot(
  weekday: number,
  startHour: number,
  endHour: number,
): { startsAt: string; endsAt: string; localDate: string } {
  for (let d = 2; d < 23; d++) {
    const probe = new Date(Date.now() + d * 86_400_000);
    const localDate = formatInTimeZone(probe, BUSINESS_TZ, "yyyy-MM-dd");
    if (new Date(`${localDate}T12:00:00Z`).getUTCDay() === weekday) {
      return {
        localDate,
        startsAt: fromZonedTime(`${localDate}T${pad(startHour)}:00:00`, BUSINESS_TZ).toISOString(),
        endsAt: fromZonedTime(`${localDate}T${pad(endHour)}:00:00`, BUSINESS_TZ).toISOString(),
      };
    }
  }
  throw new Error(`no upcoming weekday ${weekday}`);
}

export const localLabel = (iso: string, fmt: string) =>
  formatInTimeZone(new Date(iso), BUSINESS_TZ, fmt);
