import Link from "next/link";
import { getCurrentRole, requireUser } from "@/lib/auth/session";
import { isManagerRole } from "@/lib/auth/guard";
import { SignOutButton } from "@/components/sign-out-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { strings } from "@/lib/strings";

export default async function DashboardPage() {
  const user = await requireUser();
  const role = await getCurrentRole();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <PageHeader title={strings.nav.dashboard} actions={<SignOutButton />} />
      <p className="text-sm text-muted">
        Signed in as <span className="font-semibold text-ink">{user.email}</span>{" "}
        ({role})
      </p>
      <Card className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-ink">{strings.mySchedule.title}</p>
          <p className="text-sm text-muted">{strings.mySchedule.subtitle}</p>
        </div>
        <Link href="/schedule" className={buttonClasses("primary", "sm")}>
          {strings.mySchedule.title}
        </Link>
      </Card>

      <Card className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-ink">{strings.availability.title}</p>
          <p className="text-sm text-muted">{strings.availability.intro}</p>
        </div>
        <Link href="/availability" className={buttonClasses("secondary", "sm")}>
          {strings.availability.managerTitle}
        </Link>
      </Card>

      {isManagerRole(role) && (
        <Card className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-ink">{strings.manage.title}</p>
            <p className="text-sm text-muted">{strings.manage.subtitle}</p>
          </div>
          <Link href="/manage" className={buttonClasses("primary", "sm")}>
            {strings.manage.title}
          </Link>
        </Card>
      )}
    </main>
  );
}
