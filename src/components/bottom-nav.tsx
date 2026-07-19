"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { strings } from "@/lib/strings";

type Tab = { href: string; label: string; icon: React.ReactNode };

const icon = (path: string) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    {path.split("|").map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);

const TABS: Tab[] = [
  { href: "/", label: strings.nav.forYou, icon: icon("M3 11l9-8 9 8|M5 10v10h14V10") },
  {
    href: "/schedule",
    label: strings.nav.mySchedule,
    icon: icon("M4 5h16v16H4z|M4 9h16|M8 3v4|M16 3v4"),
  },
  {
    href: "/requests",
    label: strings.nav.requests,
    icon: icon("M4 4h16v12H8l-4 4z"),
  },
  {
    href: "/profile",
    label: strings.nav.profile,
    icon: icon("M12 12a4 4 0 100-8 4 4 0 000 8|M4 21c0-4 4-6 8-6s8 2 8 6"),
  },
];

/** Fixed mobile bottom navigation for the employee app (SCH-28). */
export function BottomNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2 text-xs ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
