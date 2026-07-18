import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { requireManager } from "@/lib/auth/session";
import { strings } from "@/lib/strings";
import { renderTemplate, TEMPLATE_IDS, type TemplateContext } from "@/lib/notifications/templates";

// Realistic sample context so managers can review copy at a glance (AC1).
const SAMPLE: TemplateContext = {
  recipientName: "Sofia",
  fromName: "Harbour Coffee Co.",
  shiftWhen: "Thu Mar 5 · 09:00–13:00",
  shiftWhere: "Gastown",
  skill: "barista",
  requesterName: "Liam",
  candidates: 3,
  asked: ["Sofia Martins", "Aiden Kaur"],
  declined: ["Noah Williams"],
  noResponse: ["Maya Johnson"],
};

export default async function NotificationsPreviewPage() {
  await requireManager();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.notifications.previewTitle}
        subtitle={strings.notifications.previewSubtitle}
        actions={
          <Link href="/manage/notifications" className={buttonClasses("secondary", "sm")}>
            ← {strings.notifications.title}
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        {TEMPLATE_IDS.map((id) => {
          const { subject, text } = renderTemplate(id, SAMPLE);
          return (
            <Card key={id} className="flex flex-col gap-1 p-4">
              <p className="text-xs text-faint">{id}</p>
              <p className="font-semibold text-ink">{subject}</p>
              <p className="whitespace-pre-line text-sm text-muted">{text}</p>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
