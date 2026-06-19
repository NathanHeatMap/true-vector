export const dynamic = "force-dynamic";

import Link from "next/link";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CaseStatePill } from "@/components/ui/state-pill";
import { listCasesForTenant } from "@/lib/case";
import { requireRole } from "@/lib/tenant";

export const metadata = { title: "Cases" };

export default async function CasesListPage() {
  const ctx = await requireRole(["officer", "owner", "hr", "auditor"]);
  const rows = await listCasesForTenant(ctx);

  const openCount = rows.filter(
    (r) => !r.state.startsWith("closed_"),
  ).length;
  const closedCount = rows.filter((r) => r.state.startsWith("closed_")).length;

  return (
    <>
      <Topbar
        breadcrumbs={[{ label: "Home", href: "/officer" }, { label: "Cases" }]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="cases" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-8 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold">Cases</h1>
              <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
                {openCount} open · {closedCount} closed · {rows.length} total
              </p>
            </div>
            <Button asChild>
              <Link href="/officer/cases/new">+ Open case</Link>
            </Button>
          </header>

          {rows.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-lg font-semibold">No cases yet</h2>
              <p className="mt-2 text-sm text-[var(--color-tv-text-2)]">
                Open a screening case by picking a candidate and the role
                you&apos;re assessing them against.
              </p>
              <div className="mt-6 flex justify-center">
                <Button asChild>
                  <Link href="/officer/cases/new">Open first case</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((r) => (
                <Card
                  key={r.caseId}
                  className="flex items-center justify-between p-5"
                >
                  <div className="flex flex-col gap-1.5">
                    <p className="font-semibold">
                      {r.candidateDisplayName}{" "}
                      <span className="text-[var(--color-tv-text-3)]">·</span>{" "}
                      <span className="text-sm font-normal text-[var(--color-tv-text-2)]">
                        {r.roleTitle}
                      </span>
                    </p>
                    <div className="flex items-center gap-2">
                      <CaseStatePill state={r.state} />
                      <span className="text-xs text-[var(--color-tv-text-3)]">
                        opened {new Date(r.openedAt).toLocaleDateString("en-AU")}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/officer/cases/${r.caseId}` as never}>Open</Link>
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
