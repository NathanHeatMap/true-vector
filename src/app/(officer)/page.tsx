import Link from "next/link";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/tenant";
import { listRolesForTenant } from "@/lib/role-profile";

export const metadata = { title: "Home" };

/**
 * Security Officer home dashboard.
 *
 * Wireframe 01. The "what needs me right now" view.
 *
 * For the prototype: real role + HITL counts come from the DB once those
 * features land. For Card 5 we render the shell + the live role count and
 * stub the rest with informative empty states.
 */
export default async function OfficerHomePage() {
  const ctx = await requireRole(["officer", "owner"]);
  const roles = await listRolesForTenant(ctx);

  const pendingSignOff = roles.filter((r) => r.status === "pending_sign_off").length;
  const drafts = roles.filter((r) => r.status === "draft").length;
  const active = roles.filter((r) => r.status === "active").length;

  return (
    <>
      <Topbar breadcrumbs={[{ label: "Home" }]} />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="home" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--color-tv-text)]">
              What needs you right now
            </h1>
            <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
              {pendingSignOff > 0
                ? `${pendingSignOff} role${pendingSignOff === 1 ? "" : "s"} awaiting your sign-off.`
                : "Nothing urgent. " +
                  `${active} active role${active === 1 ? "" : "s"}, ` +
                  `${drafts} draft${drafts === 1 ? "" : "s"} in progress.`}
            </p>
          </header>

          {/* Stat strip */}
          <div className="mb-8 grid grid-cols-4 gap-4">
            <StatCard label="Cases open" value="0" subtitle="prototype: cases come in Card 6" />
            <StatCard label="HITL tasks" value="0" subtitle="prototype: tasks come in Card 8" />
            <StatCard label="Roles drafted" value={String(drafts)} />
            <StatCard label="Roles pending sign-off" value={String(pendingSignOff)} accent={pendingSignOff > 0} />
          </div>

          {/* Quick actions */}
          <section className="mb-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
              Quick actions
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/officer/roles/new">+ New role</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/officer/roles">View all roles</Link>
              </Button>
            </div>
          </section>

          {/* Recent roles (last 5) */}
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
              Recent roles
            </h2>
            {roles.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-sm text-[var(--color-tv-text-2)]">
                  No roles yet. Create one to see how the Role Risk Agent scores it.
                </p>
                <div className="mt-4 flex justify-center">
                  <Button asChild>
                    <Link href="/officer/roles/new">Create first role</Link>
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {roles.slice(0, 5).map((r) => (
                  <Card key={r.roleProfileId} className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-semibold">{r.title}</p>
                      <p className="text-xs text-[var(--color-tv-text-2)]">
                        v{r.version} · tier: {r.computedTier} · status:{" "}
                        {r.status.replace(/_/g, " ")}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/officer/roles/${r.roleProfileId}` as never}>Open</Link>
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--color-tv-text-2)]">
        {label}
      </p>
      <p
        className={
          accent
            ? "mt-2 text-2xl font-bold text-[var(--color-tv-accent)]"
            : "mt-2 text-2xl font-bold text-[var(--color-tv-text)]"
        }
      >
        {value}
      </p>
      {subtitle && (
        <p className="mt-1 text-[11px] text-[var(--color-tv-text-3)]">{subtitle}</p>
      )}
    </Card>
  );
}
