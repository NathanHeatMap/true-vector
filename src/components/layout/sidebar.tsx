import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Officer sidebar — fixed at 200px wide.
 * Active nav item highlighted with deep-blue accent (matches wireframes 01-09).
 *
 * NOTE: active state is computed via `currentSection` rather than the URL
 * because layout doesn't always know the URL in RSC; pages pass the section in.
 */

type Section = "home" | "tasks" | "cases" | "candidates" | "roles" | "workforce" | "audit" | "team";

const NAV: Array<{ section: Section; label: string; href: string }> = [
  { section: "home", label: "Home", href: "/officer" },
  { section: "tasks", label: "Tasks", href: "/officer/tasks" },
  { section: "cases", label: "Cases", href: "/officer/cases" },
  { section: "candidates", label: "Candidates", href: "/officer/candidates" },
  { section: "roles", label: "Roles", href: "/officer/roles" },
  { section: "workforce", label: "Workforce", href: "/officer/workforce" },
  { section: "audit", label: "Audit", href: "/officer/audit" },
  { section: "team", label: "Team", href: "/officer/team" },
];

export function Sidebar({ section }: { section: Section }) {
  return (
    <aside
      className="flex w-[200px] shrink-0 flex-col border-r border-[var(--color-tv-border-soft)] bg-[var(--color-tv-surface-2)] py-4"
      aria-label="Primary navigation"
    >
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map((item) => {
          const active = item.section === section;
          return (
            <Link
              key={item.section}
              href={item.href as never}
              className={cn(
                "relative flex items-center px-6 py-2.5 text-sm font-medium text-[var(--color-tv-text)] hover:bg-[var(--color-tv-accent-soft)]",
                active &&
                  "bg-[var(--color-tv-accent-soft)] font-semibold text-[var(--color-tv-accent)]",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-full w-[3px] bg-[var(--color-tv-accent)]"
                />
              )}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="px-6 text-[11px] text-[var(--color-tv-text-3)]">
        v0.1 · prototype
      </p>
    </aside>
  );
}
