import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { SignOutButton } from "@/components/sign-out-button";
import { AvailabilityEditor } from "@/components/availability-editor";
import { requireUser, getCurrentEmployeeId } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeAvailability } from "@/lib/availability/queries";
import { strings } from "@/lib/strings";

export default async function MyAvailabilityPage() {
  await requireUser();
  const employeeId = await getCurrentEmployeeId();
  if (!employeeId) redirect("/login");

  const supabase = await createClient();
  const availability = await getEmployeeAvailability(supabase, employeeId);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-6">
      <PageHeader
        title={strings.availability.title}
        subtitle={strings.availability.intro}
        actions={<SignOutButton />}
      />
      <AvailabilityEditor employeeId={employeeId} initial={availability} />
    </main>
  );
}
