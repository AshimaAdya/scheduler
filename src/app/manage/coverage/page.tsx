import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resolveSettings } from "@/lib/settings/resolve";
import { strings } from "@/lib/strings";
import { CoverageCountdown } from "./coverage-countdown";
import { ApproveDayOffButton } from "./approve-button";
import { ConfirmSwapButton } from "./confirm-swap-button";
import { OverridePanel } from "./override-panel";

const ACTIVE = new Set(["tier1_broadcast", "tier2_broadcast", "escalated"]);
// A manager can override any unresolved broadcast (never a peer swap).
const OVERRIDABLE = new Set(["open", "tier1_broadcast", "tier2_broadcast", "escalated"]);
const tone = (status: string) =>
  status === "covered"
    ? "ok"
    : status === "cancelled"
      ? "neutral"
      : status === "escalated"
        ? "danger"
        : "warn";

type ShiftEmbed = {
  starts_at: string;
  ends_at: string;
  required_skill: string;
  locations: { name: string } | { name: string }[] | null;
};

export default async function CoveragePage() {
  const supabase = await createClient();

  const [{ data: business }, { data: requests }] = await Promise.all([
    supabase.from("businesses").select("settings").limit(1).maybeSingle(),
    supabase
      .from("coverage_requests")
      .select(
        "id, status, trigger_type, tier_expires_at, time_off_approved_at, requested_by, covered_by, shift_id, offered_shift_id, shifts:shift_id(starts_at, ends_at, required_skill, locations:location_id(name))",
      )
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const settings = resolveSettings(business?.settings);
  const tz = settings.timezone;
  const requireApproval = settings.approval_mode === "require_approval";
  const rows = requests ?? [];

  // Resolve requester / coverer names.
  const empIds = [
    ...new Set(
      rows.flatMap((r) => [r.requested_by, r.covered_by].filter(Boolean) as string[]),
    ),
  ];
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", empIds)
    : { data: [] };
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  // A covered swap still needs a manager's confirmation while either swapped
  // assignment is pending_approval (require_approval mode).
  const swapShiftIds = rows
    .filter((r) => r.trigger_type === "direct_swap" && r.status === "covered")
    .flatMap((r) => [r.shift_id, r.offered_shift_id].filter(Boolean) as string[]);
  const { data: pendingAssignments } = swapShiftIds.length
    ? await supabase
        .from("shift_assignments")
        .select("shift_id")
        .in("shift_id", swapShiftIds)
        .eq("pending_approval", true)
    : { data: [] };
  const pendingShiftIds = new Set((pendingAssignments ?? []).map((a) => a.shift_id));
  const swapNeedsConfirm = (r: (typeof rows)[number]) =>
    r.trigger_type === "direct_swap" &&
    r.status === "covered" &&
    (pendingShiftIds.has(r.shift_id) ||
      (r.offered_shift_id ? pendingShiftIds.has(r.offered_shift_id) : false));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.coverage.title}
        subtitle={strings.coverage.subtitle}
        actions={
          <Link href="/manage" className={buttonClasses("secondary", "sm")}>
            ← {strings.manage.title}
          </Link>
        }
      />

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{strings.coverage.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const shiftRel = r.shifts as ShiftEmbed | ShiftEmbed[] | null;
            const shift = Array.isArray(shiftRel) ? shiftRel[0] : shiftRel;
            const loc = shift?.locations;
            const locName = Array.isArray(loc) ? loc?.[0]?.name : loc?.name;
            const when = shift
              ? `${formatInTimeZone(new Date(shift.starts_at), tz, "EEE MMM d · HH:mm")}–${formatInTimeZone(new Date(shift.ends_at), tz, "HH:mm")}`
              : "—";
            const statusLabel =
              strings.coverage.status[r.status as keyof typeof strings.coverage.status] ??
              r.status;
            const coverer = r.covered_by ? nameById.get(r.covered_by) : null;

            const canOverride =
              r.trigger_type !== "direct_swap" && OVERRIDABLE.has(r.status);

            return (
              <Card key={r.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">
                      {when}
                      {shift ? ` · ${shift.required_skill}` : ""}
                      {locName ? ` · ${locName}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {strings.coverage.triggers[
                        r.trigger_type as keyof typeof strings.coverage.triggers
                      ] ?? r.trigger_type}
                      {" · "}
                      {nameById.get(r.requested_by) ?? "—"}
                      {coverer ? ` · ${strings.coverage.status.covered} ${coverer}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Chip tone={tone(r.status)}>{statusLabel}</Chip>
                    {ACTIVE.has(r.status) && r.tier_expires_at && (
                      <span className="text-xs text-faint">
                        <CoverageCountdown expiresAt={r.tier_expires_at} />
                      </span>
                    )}
                    {r.trigger_type === "day_off" && r.time_off_approved_at && (
                      <Chip tone="ok">{strings.coverage.approved}</Chip>
                    )}
                    {/* Manager confirmation only appears in require_approval mode,
                        and only once coverage is confirmed. */}
                    {r.trigger_type === "day_off" &&
                      r.status === "covered" &&
                      !r.time_off_approved_at &&
                      requireApproval && <ApproveDayOffButton requestId={r.id} />}
                    {swapNeedsConfirm(r) && <ConfirmSwapButton requestId={r.id} />}
                  </div>
                </div>
                {canOverride && <OverridePanel requestId={r.id} />}
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
