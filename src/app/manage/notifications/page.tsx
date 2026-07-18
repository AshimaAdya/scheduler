import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { buttonClasses } from "@/components/ui/button";
import { requireManager } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveSettings } from "@/lib/settings/resolve";
import { strings } from "@/lib/strings";

const statusTone = (status: string) =>
  status === "failed"
    ? "danger"
    : status === "sent" || status === "delivered"
      ? "ok"
      : "neutral";

export default async function NotificationsLogPage() {
  await requireManager();
  const supabase = await createClient();

  const [{ data: business }, { data: rows }] = await Promise.all([
    supabase.from("businesses").select("settings").limit(1).maybeSingle(),
    supabase
      .from("notifications_log")
      .select("id, recipient_employee_id, channel, template, status, error, sent_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const tz = resolveSettings(business?.settings).timezone;
  const log = rows ?? [];

  const empIds = [
    ...new Set(log.map((r) => r.recipient_employee_id).filter(Boolean) as string[]),
  ];
  const { data: emps } = empIds.length
    ? await supabase.from("employees").select("id, full_name").in("id", empIds)
    : { data: [] };
  const nameById = new Map((emps ?? []).map((e) => [e.id, e.full_name]));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.notifications.title}
        subtitle={strings.notifications.subtitle}
        actions={
          <div className="flex gap-2">
            <Link
              href="/manage/notifications/preview"
              className={buttonClasses("secondary", "sm")}
            >
              {strings.notifications.previewTitle}
            </Link>
            <Link href="/manage" className={buttonClasses("secondary", "sm")}>
              ← {strings.manage.title}
            </Link>
          </div>
        }
      />

      {log.length === 0 ? (
        <p className="text-sm text-muted">{strings.notifications.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {log.map((r) => {
            const channelLabel =
              strings.notifications.channels[
                r.channel as keyof typeof strings.notifications.channels
              ] ?? r.channel;
            const statusLabel =
              strings.notifications.status[
                r.status as keyof typeof strings.notifications.status
              ] ?? r.status;
            const stamp = formatInTimeZone(
              new Date(r.sent_at ?? r.created_at),
              tz,
              "MMM d · HH:mm",
            );
            return (
              <Card key={r.id} className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {nameById.get(r.recipient_employee_id ?? "") ?? "—"}
                    <span className="text-muted"> · {channelLabel}</span>
                  </p>
                  <p className="truncate text-sm text-muted">{r.template}</p>
                  {r.error && <p className="truncate text-xs text-danger">{r.error}</p>}
                </div>
                <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                  <Chip tone={statusTone(r.status)}>{statusLabel}</Chip>
                  <span className="text-xs text-faint">{stamp}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </main>
  );
}
