import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { BottomNav } from "@/components/bottom-nav";
import { buttonClasses } from "@/components/ui/button";
import { SignOutButton } from "@/components/sign-out-button";
import { requireUser, getCurrentEmployeeId, getCurrentRole } from "@/lib/auth/session";
import { isManagerRole } from "@/lib/auth/guard";
import { createClient } from "@/lib/supabase/server";
import { strings } from "@/lib/strings";
import { NotifyPrefControl } from "./notify-pref";

const roleLabels = strings.person.roles;

/** Show only the last 4 digits of a stored E.164 number. */
function maskPhone(phone: string | null): string {
  if (!phone) return strings.profile.noPhone;
  const last4 = phone.slice(-4);
  return `··· ··· ${last4}`;
}

type LocationRel = { name: string } | { name: string }[] | null;

export default async function ProfilePage() {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) redirect("/login");
  const role = await getCurrentRole();

  const supabase = await createClient();
  const { data: me } = await supabase
    .from("employees")
    .select("full_name, role, phone, notify_pref, locations:home_location_id(name)")
    .eq("id", employeeId)
    .maybeSingle();

  const loc = me?.locations as LocationRel;
  const locationName = Array.isArray(loc) ? (loc[0]?.name ?? null) : (loc?.name ?? null);
  const roleLabel = me ? roleLabels[me.role as keyof typeof roleLabels] : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6 pb-24">
      <PageHeader
        title={me?.full_name ?? strings.profile.title}
        subtitle={[roleLabel, locationName].filter(Boolean).join(" · ")}
        actions={<SignOutButton />}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted">{strings.profile.contactHeader}</h2>
        <Card className="flex flex-col gap-3 p-4">
          <NotifyPrefControl initial={me?.notify_pref ?? "both"} />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">{strings.profile.phone}</span>
            <span className="text-ink">{maskPhone(me?.phone ?? null)}</span>
          </div>
        </Card>
      </section>

      <div className="flex flex-col gap-2">
        <Link href="/availability" className={buttonClasses("secondary", "md")}>
          {strings.profile.availability}
        </Link>
        {isManagerRole(role) && (
          <Link href="/manage" className={buttonClasses("secondary", "md")}>
            {strings.profile.manage}
          </Link>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
