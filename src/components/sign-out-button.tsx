export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded border border-gray-300 px-3 py-1.5 text-sm"
      >
        Sign out
      </button>
    </form>
  );
}
