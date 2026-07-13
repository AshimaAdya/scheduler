import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";
import { LocationForm } from "../location-form";

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id, name, address")
    .eq("id", id)
    .maybeSingle();

  if (!location) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <PageHeader
        title={location.name}
        actions={
          <Link
            href="/manage/locations"
            className={buttonClasses("secondary", "sm")}
          >
            ← {strings.locations.title}
          </Link>
        }
      />
      <Card>
        <LocationForm mode="edit" location={location} />
      </Card>
    </main>
  );
}
