import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

/**
 * Top bar — 60px high.
 * Shows logo (left), breadcrumb (centre-left), user menu (right).
 * Matches the wireframe top nav.
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Topbar({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
  return (
    <header className="flex h-[60px] items-center justify-between border-b border-[var(--color-tv-border-soft)] bg-[var(--color-tv-surface-2)] px-6">
      <div className="flex items-center gap-6">
        <Link href="/officer" className="flex items-center gap-2 font-semibold">
          <span aria-hidden>▦</span>
          <span>True Vector</span>
        </Link>
        <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-tv-text-2)]">
          <ol className="flex items-center gap-2">
            {breadcrumbs.map((crumb, i) => (
              <li key={i} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden>›</span>}
                {crumb.href ? (
                  <Link href={crumb.href as never} className="hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
      <UserButton />
    </header>
  );
}
