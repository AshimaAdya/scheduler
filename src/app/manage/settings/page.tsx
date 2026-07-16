import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { resolveSettings } from "@/lib/settings/resolve";
import { strings } from "@/lib/strings";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: business } = await supabase
    .from("businesses")
    .select("id, settings")
    .limit(1)
    .maybeSingle();

  if (!business) notFound();

  const settings = resolveSettings(business.settings);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.settings.title}
        subtitle={strings.settings.subtitle}
        actions={
          <Link href="/manage" className={buttonClasses("secondary", "sm")}>
            ← {strings.manage.title}
          </Link>
        }
      />
      <Card>
        <SettingsForm businessId={business.id} settings={settings} />
      </Card>
    </main>
  );
}
