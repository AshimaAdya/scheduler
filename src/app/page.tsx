import { redirect } from "next/navigation";

export default function Home() {
  // Authenticated users land on the dashboard; the proxy sends guests to /login.
  redirect("/dashboard");
}
