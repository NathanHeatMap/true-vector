export const dynamic = "force-dynamic";

import Link from "next/link";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listCandidatesForTenant } from "@/lib/candidate";
import { listOpenableRolesForTenant } from "@/lib/case";
import { requireRole } from "@/lib/tenant";

import { OpenCasePicker } from "./open-case-picker";

export const metadata = { title: "Open case" };

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<{ candidateId?: string; roleProfileId?: string }>;
}) {
  const ctx = await requireRole(["officer", "owner", "hr"]);
  const params = await searchParams;
  const [cands, roles] = await Promise.all([
    listCandidatesForTenant(ctx),
    listOpenableRolesForTenant(ctx),
  ]);

  // The picker shows a candidate dropdown and a role dropdown.
  // Pre-select either side if the user came from a candidate or role page.
  const preselectedCandidateId = params.candidateId ?? "";
  const preselectedRoleProfileId = params.roleProfileId ?? "";

  return (
    <>
      <Topbar
        breadcrumbs={[
          { label: "Home", href: "/officer" },
          { label: "Cases", href: "/officer/cases" },
          { label: "Open case" },
        ]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="cases" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-6">
            <h1 className="text-2xl font-bold">Open case</h1>
            <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
              Pick a candidate and the role you&apos;re assessing them against.
              The case starts in <span className="font-semibold">Draft</span>{" "}
              state — consent capture comes next.
            </p>
          </header>

          {cands.length === 0 || roles.length === 0 ? (
            <Card className="p-8">
              <h2 className="text-lg font-semibold">
                You need a candidate and a role to open a case
              </h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm text-[var(--color-tv-text-2)]">
                <li className="flex items-center gap-2">
                  {cands.length > 0 ? (
                    <Badge tone="success">Ready</Badge>
                  ) : (
                    <Badge tone="warn">Missing</Badge>
                  )}
                  At least one candidate ({cands.length} on file)
                </li>
                <li className="flex items-center gap-2">
                  {roles.length > 0 ? (
                    <Badge tone="success">Ready</Badge>
                  ) : (
                    <Badge tone="warn">Missing</Badge>
                  )}
                  At least one role ({roles.length} on file)
                </li>
              </ul>
              <div className="mt-5 flex gap-3">
                {cands.length === 0 && (
                  <Button asChild>
                    <Link href="/officer/candidates/new">+ Add candidate</Link>
                  </Button>
                )}
                {roles.length === 0 && (
                  <Button asChild>
                    <Link href="/officer/roles/new">+ Add role</Link>
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <OpenCasePicker
              candidates={cands.map((c) => ({
                candidateId: c.candidateId,
                displayName: c.displayName,
                primaryEmail: c.primaryEmail,
              }))}
              roles={roles.map((r) => ({
                roleProfileId: r.roleProfileId,
                title: r.title,
                version: r.version,
                computedTier: r.computedTier,
                status: r.status,
              }))}
              preselectedCandidateId={preselectedCandidateId}
              preselectedRoleProfileId={preselectedRoleProfileId}
            />
          )}
        </main>
      </div>
    </>
  );
}
