export const dynamic = "force-dynamic";

import Link from "next/link";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RoleProfileStatePill } from "@/components/ui/state-pill";
import { listRolesForTenant } from "@/lib/role-profile";
import { requireRole } from "@/lib/tenant";

export const metadata = { title: "Roles" };

export default async function RolesListPage() {
  const ctx = await requireRole(["officer", "owner"]);
  const roles = await listRolesForTenant(ctx);

  return (
    <>
      <Topbar
        breadcrumbs={[{ label: "Home", href: "/officer" }, { label: "Roles" }]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="roles" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-8 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold">Roles</h1>
              <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
                {roles.length} role{roles.length === 1 ? "" : "s"} ·{" "}
                {roles.filter((r) => r.status === "active").length} active ·{" "}
                {roles.filter((r) => r.status === "pending_sign_off").length} pending sign-off
              </p>
            </div>
            <Button asChild>
              <Link href="/officer/roles/new">+ New role</Link>
            </Button>
          </header>

          {roles.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-lg font-semibold">No roles yet</h2>
              <p className="mt-2 text-sm text-[var(--color-tv-text-2)]">
                Create your first role and the Role Risk Agent will score it,
                propose a check set, and draft the position-description clauses.
              </p>
              <div className="mt-6 flex justify-center">
                <Button asChild>
                  <Link href="/officer/roles/new">Create first role</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {roles.map((r) => (
                <Card
                  key={r.roleProfileId}
                  className="flex items-center justify-between p-5"
                >
                  <div className="flex flex-col gap-1.5">
                    <p className="font-semibold">{r.title}</p>
                    <div className="flex items-center gap-2">
                      <RoleProfileStatePill state={r.status} />
                      <span className="text-xs text-[var(--color-tv-text-3)]">
                        v{r.version} · tier: {r.computedTier}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/officer/roles/${r.roleProfileId}` as never}>
                      Open
                    </Link>
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
