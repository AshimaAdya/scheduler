import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { strings } from "@/lib/strings";

export default function ManagePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <PageHeader title={strings.manage.title} subtitle={strings.manage.subtitle} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/manage/employees" className="block">
          <Card className="h-full transition-colors hover:border-accent">
            <h2 className="text-lg font-semibold text-ink">{strings.nav.team}</h2>
            <p className="mt-1 text-sm text-muted">
              Add people, set roles and skills, deactivate when someone leaves.
            </p>
          </Card>
        </Link>

        <Link href="/manage/locations" className="block">
          <Card className="h-full transition-colors hover:border-accent">
            <h2 className="text-lg font-semibold text-ink">
              {strings.nav.locations}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Add and edit the places your team works.
            </p>
          </Card>
        </Link>
      </div>
    </main>
  );
}
