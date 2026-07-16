import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SignOutButton } from "@/components/sign-out-button";
import { requireUser, getCurrentEmployeeId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeSchedule } from "@/lib/schedule/employee-view";
import { strings } from "@/lib/strings";
import { ClaimButton } from "./claim-button";
import { CantMakeItButton } from "./cant-make-it-button";

export default async function MySchedulePage() {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) redirect("/login");

  // Employee's own (RLS-scoped) client — guarantees no other employee's data.
  const supabase = await createClient();
  const { own, claimable } = await getEmployeeSchedule(supabase, employeeId);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <PageHeader
        title={strings.mySchedule.title}
        subtitle={strings.mySchedule.subtitle}
        actions={<SignOutButton />}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">
          {strings.mySchedule.upcoming}
        </h2>
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
                <Chip tone="warn">{strings.mySchedule.findingCover}</Chip>
              ) : s.pendingApproval ? (
                <Chip tone="warn">{strings.mySchedule.pending}</Chip>
              ) : (
                <CantMakeItButton shiftId={s.id} />
              )}
            </Card>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">
          {strings.mySchedule.open}
        </h2>
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
    </main>
  );
}
