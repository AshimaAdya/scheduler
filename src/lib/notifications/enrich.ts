import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import type { TemplateContext } from "./templates";

/** Human-readable shift facts resolved from a shift id. */
export type ShiftContext = { shiftWhen: string; shiftWhere: string | null; skill: string };

type ShiftEmbed = {
  id: string;
  starts_at: string;
  ends_at: string;
  required_skill: string;
  locations: { name: string } | { name: string }[] | null;
};

/**
 * Batch-resolve the shift ids referenced by a set of message payloads into
 * display context, so templates render with real date/time/location/role.
 */
export async function loadShiftContexts(
  supabase: SupabaseClient,
  shiftIds: string[],
  timezone: string,
): Promise<Map<string, ShiftContext>> {
  const ids = [...new Set(shiftIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const { data } = await supabase
    .from("shifts")
    .select("id, starts_at, ends_at, required_skill, locations:location_id(name)")
    .in("id", ids);

  const map = new Map<string, ShiftContext>();
  for (const s of (data ?? []) as ShiftEmbed[]) {
    const loc = s.locations;
    const where = Array.isArray(loc) ? (loc[0]?.name ?? null) : (loc?.name ?? null);
    map.set(s.id, {
      shiftWhen: `${formatInTimeZone(new Date(s.starts_at), timezone, "EEE MMM d · HH:mm")}–${formatInTimeZone(new Date(s.ends_at), timezone, "HH:mm")}`,
      shiftWhere: where,
      skill: s.required_skill,
    });
  }
  return map;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined;
}

/** Merge resolved shift facts + pass-through payload fields into a render context. */
export function buildContext(
  payload: Record<string, unknown>,
  base: { recipientName: string; fromName: string },
  shiftContexts: Map<string, ShiftContext>,
): TemplateContext {
  const shiftId = typeof payload.shiftId === "string" ? payload.shiftId : undefined;
  const shift = shiftId ? shiftContexts.get(shiftId) : undefined;

  return {
    recipientName: base.recipientName,
    fromName: base.fromName,
    shiftWhen: shift?.shiftWhen,
    shiftWhere: shift?.shiftWhere,
    skill: shift?.skill,
    requesterName: typeof payload.requesterName === "string" ? payload.requesterName : undefined,
    candidates: typeof payload.candidates === "number" ? payload.candidates : undefined,
    asked: stringArray(payload.asked),
    declined: stringArray(payload.declined),
    noResponse: stringArray(payload.noResponse),
  };
}

/** Pull every shift id a batch of payloads references (for a single preload). */
export function shiftIdsFromPayloads(payloads: Record<string, unknown>[]): string[] {
  const ids: string[] = [];
  for (const p of payloads) {
    if (typeof p.shiftId === "string") ids.push(p.shiftId);
    if (typeof p.offeredShiftId === "string") ids.push(p.offeredShiftId);
  }
  return ids;
}
