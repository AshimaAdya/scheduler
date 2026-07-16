import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";
import { LocationForm } from "./location-form";

export default async function LocationsPage() {
  const supabase = await createClient();
  const { data: locations } = await supabase
    .from("locations")
    .select("id, name, address")
    .order("name");

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6">
      <PageHeader
        title={strings.locations.title}
        actions={
          <Link href="/manage" className={buttonClasses("secondary", "sm")}>
            ← {strings.manage.title}
          </Link>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted">
            {strings.locations.add}
          </h2>
          <Card>
            <LocationForm mode="create" />
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-muted">
            {strings.locations.title}
          </h2>
          {locations && locations.length > 0 ? (
            <div className="flex flex-col gap-2">
              {locations.map((loc) => (
                <Link key={loc.id} href={`/manage/locations/${loc.id}`}>
                  <Card className="flex items-center justify-between p-4 transition-colors hover:border-accent">
                    <div>
                      <p className="font-semibold text-ink">{loc.name}</p>
                      {loc.address && (
                        <p className="text-sm text-muted">{loc.address}</p>
                      )}
                    </div>
                    <span className="text-sm text-accent">{strings.common.edit}</span>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">{strings.locations.empty}</p>
          )}
        </div>
      </div>
    </main>
  );
}
