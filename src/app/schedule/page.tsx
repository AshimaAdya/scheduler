import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { BottomNav } from "@/components/bottom-nav";
import { requireUser, getCurrentEmployeeId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeSchedule } from "@/lib/schedule/employee-view";
import { strings } from "@/lib/strings";
import { ClaimButton } from "./claim-button";
import { ShiftActions } from "./shift-actions";

/**
 * My schedule (SCH-28, deck E3): a phone-friendly week list of the employee's own
 * shifts plus open shifts they can claim. Decisions/asks live on the For-you feed;
 * this screen is the calm reference view. RLS-scoped client → invariant #3.
 */
export default async function MySchedulePage() {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) redirect("/login");

  const supabase = await createClient();
  const { own, claimable } = await getEmployeeSchedule(supabase, employeeId);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6 pb-24">
      <PageHeader title={strings.nav.mySchedule} subtitle={strings.mySchedule.subtitle} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">{strings.mySchedule.upcoming}</h2>
        {own.length === 0 ? (
          <p className="text-sm text-muted">{strings.mySchedule.noneUpcoming}</p>
        ) : (
          own.map((s) => (
            <Card key={s.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-semibold text-ink">
                  {s.dateLabel} · {s.timeLabel}
                </p>
                <p className="text-sm text-muted">
                  {s.skill}
                  {s.locationName ? ` · ${s.locationName}` : ""}
                </p>
              </div>
              {s.coverageStatus ? (
                <Chip tone="warn">
                  {s.coverageTrigger === "direct_swap"
                    ? strings.mySchedule.swapProposed
                    : strings.mySchedule.findingCover}
                </Chip>
              ) : s.pendingApproval ? (
                <Chip tone="warn">{strings.mySchedule.pending}</Chip>
              ) : (
                <ShiftActions shiftId={s.id} />
              )}
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">{strings.mySchedule.open}</h2>
        {claimable.length === 0 ? (
          <p className="text-sm text-muted">{strings.mySchedule.noneOpen}</p>
        ) : (
          claimable.map((s) => (
            <Card
              key={s.id}
              className="flex items-center justify-between gap-3 border-dashed p-4"
            >
              <div>
                <p className="font-semibold text-ink">
                  {s.dateLabel} · {s.timeLabel}
                </p>
                <p className="text-sm text-muted">
                  {s.skill}
                  {s.locationName ? ` · ${s.locationName}` : ""}
                </p>
              </div>
              <ClaimButton shiftId={s.id} />
            </Card>
          ))
        )}
      </section>

      <p className="text-sm text-faint">{strings.mySchedule.onlyYours}</p>
      <BottomNav />
    </main>
  );
}
