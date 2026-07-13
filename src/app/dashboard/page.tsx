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
