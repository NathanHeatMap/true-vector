export const dynamic = "force-dynamic";

import Link from "next/link";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listCandidatesForTenant } from "@/lib/candidate";
import { requireRole } from "@/lib/tenant";

export const metadata = { title: "Candidates" };

export default async function CandidatesListPage() {
  const ctx = await requireRole(["officer", "owner", "hr"]);
  const rows = await listCandidatesForTenant(ctx);

  return (
    <>
      <Topbar
        breadcrumbs={[{ label: "Home", href: "/officer" }, { label: "Candidates" }]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="candidates" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-8 flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-bold">Candidates</h1>
              <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
                {rows.length} candidate{rows.length === 1 ? "" : "s"} on file.
              </p>
            </div>
            <Button asChild>
              <Link href="/officer/candidates/new">+ New candidate</Link>
            </Button>
          </header>

          {rows.length === 0 ? (
            <Card className="p-12 text-center">
              <h2 className="text-lg font-semibold">No candidates yet</h2>
              <p className="mt-2 text-sm text-[var(--color-tv-text-2)]">
                Add a candidate to assess them against one of your roles. Each
                candidate becomes the subject of a screening case.
              </p>
              <div className="mt-6 flex justify-center">
                <Button asChild>
                  <Link href="/officer/candidates/new">Add first candidate</Link>
                </Button>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((c) => (
                <Card
                  key={c.candidateId}
                  className="flex items-center justify-between p-5"
                >
                  <div className="flex flex-col gap-1.5">
                    <p className="font-semibold">{c.displayName}</p>
                    <p className="text-xs text-[var(--color-tv-text-3)]">
                      {c.primaryEmail}
                      {c.primaryPhone ? ` · ${c.primaryPhone}` : ""}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/officer/candidates/${c.candidateId}` as never}>
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
