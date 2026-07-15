import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { strings } from "@/lib/strings";
import { ImportForm } from "./import-form";

export default function ImportPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.import.title}
        subtitle={strings.import.subtitle}
        actions={
          <>
            <Link
              href="/manage/employees"
              className={buttonClasses("secondary", "sm")}
            >
              ← {strings.team.title}
            </Link>
            {/* Route handler that streams a CSV download, not a page. */}
            <a
              href="/manage/employees/import/template"
              className={buttonClasses("secondary", "sm")}
              download
            >
              {strings.import.downloadTemplate}
            </a>
          </>
        }
      />
      <Card>
        <ImportForm />
      </Card>
    </main>
  );
}
