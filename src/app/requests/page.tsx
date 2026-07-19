import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { BottomNav } from "@/components/bottom-nav";
import { ProgressDots } from "@/components/progress-dots";
import { requireUser, getCurrentEmployeeId } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getMyRequests, type MyRequest } from "@/lib/coverage/my-requests";
import { getOutgoingSwaps } from "@/lib/coverage/swap";
import { strings } from "@/lib/strings";
import { FellThroughList } from "../schedule/swap-inbox";

const ACTIVE = new Set(["open", "tier1_broadcast", "tier2_broadcast", "escalated"]);

function StatusRow({ r }: { r: MyRequest }) {
  if (ACTIVE.has(r.status)) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Chip tone="warn">{strings.myRequests.inProgress}</Chip>
        <ProgressDots status={r.status} />
      </div>
    );
  }
  if (r.status === "covered") {
    return (
      <div className="flex flex-col items-end gap-1">
        <Chip tone="ok">
          {r.coveredByFirstName
            ? strings.myRequests.coveredBy(r.coveredByFirstName)
            : strings.journey.done}
        </Chip>
        {r.approved && <Chip tone="ok">{strings.myRequests.approved}</Chip>}
      </div>
    );
  }
  if (r.status === "cancelled") {
    return (
      <Chip tone={r.trigger === "direct_swap" ? "danger" : "neutral"}>
        {r.trigger === "direct_swap"
          ? strings.myRequests.swapDeclined
          : strings.myRequests.cancelled}
      </Chip>
    );
  }
  return <Chip tone="neutral">{strings.myRequests.resolved}</Chip>;
}

export default async function MyRequestsPage() {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) redirect("/login");

  const admin = createServiceRoleClient();
  const [requests, fellThroughSwaps] = await Promise.all([
    getMyRequests(admin, employeeId),
    getOutgoingSwaps(admin, employeeId),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6 pb-24">
      <PageHeader title={strings.myRequests.title} subtitle={strings.myRequests.subtitle} />

      {requests.length === 0 ? (
        <p className="text-sm text-muted">{strings.myRequests.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {requests.map((r) => (
            <Card key={r.id} className="flex items-start justify-between gap-3 p-4">
              <div>
                <p className="font-semibold text-ink">{r.when}</p>
                <p className="text-sm text-muted">
                  {strings.coverage.triggers[
                    r.trigger as keyof typeof strings.coverage.triggers
                  ] ?? r.trigger}
                  {r.skill ? ` · ${r.skill}` : ""}
                </p>
              </div>
              <StatusRow r={r} />
            </Card>
          ))}
        </div>
      )}

      {fellThroughSwaps.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted">
            {strings.mySchedule.swapFellThrough}
          </h2>
          <FellThroughList outgoing={fellThroughSwaps} />
        </section>
      )}

      <BottomNav />
    </main>
  );
}
