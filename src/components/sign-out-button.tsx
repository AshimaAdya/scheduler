import { buttonClasses } from "@/components/ui/button";
import { strings } from "@/lib/strings";

export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button type="submit" className={buttonClasses("secondary", "sm")}>
        {strings.common.signOut}
      </button>
    </form>
  );
}
