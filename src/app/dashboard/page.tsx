import { redirect } from "next/navigation";

/** Legacy path — the home for everyone is now the "For you" feed at `/`. */
export default function DashboardPage() {
  redirect("/");
}
