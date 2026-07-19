import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { BottomNav } from "@/components/bottom-nav";
import { ProgressDots } from "@/components/progress-dots";
import { buttonClasses } from "@/components/ui/button";
import { requireUser, getCurrentEmployeeId, getCurrentRole } from "@/lib/auth/session";
import { isManagerRole } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getEmployeeSchedule } from "@/lib/schedule/employee-view";
import { getCoverageAsks } from "@/lib/coverage/respond";
import { getIncomingSwaps } from "@/lib/coverage/swap";
import { strings } from "@/lib/strings";
import { CoverageAsks } from "./schedule/coverage-asks";
import { SwapInbox } from "./schedule/swap-inbox";
import { ShiftActions } from "./schedule/shift-actions";
import { ClaimButton } from "./schedule/claim-button";

export default async function HomeFeedPage() {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) redirect("/login");
  const role = await getCurrentRole();

  const supabase = await createClient(); // RLS: own + open shifts only
  const admin = createServiceRoleClient(); // scoped disclosure loaders

  const [{ own, claimable }, coverageAsks, incomingSwaps] = await Promise.all([
    getEmployeeSchedule(supabase, employeeId),
    getCoverageAsks(admin, employeeId),
    getIncomingSwaps(admin, employeeId),
  ]);

  const nextShift = own[0];
  const grabbable = claimable.slice(0, 2);
  const activeRequests = own.filter((s) => s.coverageStatus);
  const needsReply = coverageAsks.length > 0 || incomingSwaps.length > 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6 pb-24">
      <PageHeader
        title={strings.home.title}
        actions={
          isManagerRole(role) ? (
            <Link href="/manage" className={buttonClasses("secondary", "sm")}>
              {strings.home.toManage}
            </Link>
          ) : undefined
        }
      />

      {/* 1 — decisions first */}
      {needsReply ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-warn">{strings.home.needsReply}</h2>
          {coverageAsks.length > 0 && <CoverageAsks asks={coverageAsks} />}
          {incomingSwaps.length > 0 && <SwapInbox incoming={incomingSwaps} />}
        </section>
      ) : (
        <p className="text-sm text-muted">{strings.home.allCaughtUp}</p>
      )}

      {/* 2 — your next shift */}
      {nextShift && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted">{strings.home.nextShift}</h2>
          <Card className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-ink">
                {nextShift.dateLabel} · {nextShift.timeLabel}
              </p>
              <p className="text-sm text-muted">
                {nextShift.skill}
                {nextShift.locationName ? ` · ${nextShift.locationName}` : ""}
              </p>
            </div>
            {nextShift.coverageStatus ? (
              <ProgressDots status={nextShift.coverageStatus} />
            ) : nextShift.pendingApproval ? (
              <Chip tone="warn">{strings.mySchedule.pending}</Chip>
            ) : (
              <ShiftActions shiftId={nextShift.id} />
            )}
          </Card>
        </section>
      )}

      {/* 3 — open shifts you can grab */}
      {grabbable.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted">{strings.home.openShift}</h2>
          {grabbable.map((s) => (
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
          ))}
        </section>
      )}

      {/* 4 — your requests summary */}
      {activeRequests.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted">{strings.home.yourRequests}</h2>
            <Link href="/requests" className="text-xs text-accent">
              {strings.home.seeAll}
            </Link>
          </div>
          {activeRequests.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
              <p className="text-sm text-ink">
                {s.dateLabel} · {s.timeLabel}
              </p>
              {s.coverageStatus && <ProgressDots status={s.coverageStatus} />}
            </Card>
          ))}
        </section>
      )}

      <BottomNav />
    </main>
  );
}
