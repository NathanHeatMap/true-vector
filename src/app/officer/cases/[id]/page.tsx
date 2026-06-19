export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CaseStatePill } from "@/components/ui/state-pill";
import { getCaseById } from "@/lib/case";
import { requireRole } from "@/lib/tenant";

export const metadata = { title: "Case detail" };

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole(["officer", "owner", "hr", "auditor"]);
  const row = await getCaseById(ctx, id);
  if (!row) notFound();

  const { caseRow, candidate, roleProfile } = row;

  return (
    <>
      <Topbar
        breadcrumbs={[
          { label: "Home", href: "/officer" },
          { label: "Cases", href: "/officer/cases" },
          { label: candidate.displayName },
        ]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="cases" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">
                {candidate.displayName} · {roleProfile.title}
              </h1>
              <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
                Opened {new Date(caseRow.openedAt).toLocaleString("en-AU")} ·
                case <span className="font-mono text-xs">{caseRow.caseId}</span>
              </p>
              <div className="mt-3 flex items-center gap-2">
                <CaseStatePill state={caseRow.state} />
                <Badge tone="neutral">
                  Role v{caseRow.roleProfileVersion}
                </Badge>
                <Badge tone="neutral">{caseRow.type}</Badge>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-6">
              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Subject
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <Field label="Candidate" value={candidate.displayName} />
                  <Field label="Email" value={candidate.primaryEmail} />
                  <Field
                    label="Phone"
                    value={candidate.primaryPhone ?? "(not provided)"}
                  />
                  <Field
                    label="Verified ID"
                    value={
                      candidate.verifiedIdentityRef ?? "(not yet verified)"
                    }
                  />
                </dl>
                <div className="mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/officer/candidates/${candidate.candidateId}` as never}>
                      Open candidate
                    </Link>
                  </Button>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Role being assessed
                </h2>
                <p className="mt-2 text-base font-semibold">
                  {roleProfile.title}
                </p>
                <p className="mt-1 text-xs text-[var(--color-tv-text-2)]">
                  v{caseRow.roleProfileVersion} · tier {roleProfile.computedTier}{" "}
                  · revalidation {roleProfile.revalidationCadence}
                </p>
                <p className="mt-3 text-sm text-[var(--color-tv-text-2)] whitespace-pre-wrap">
                  {roleProfile.description.slice(0, 240)}
                  {roleProfile.description.length > 240 ? "…" : ""}
                </p>
                <div className="mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/officer/roles/${roleProfile.roleProfileId}` as never}
                    >
                      Open role profile
                    </Link>
                  </Button>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Lifecycle
                </h2>
                <p className="mt-3 text-sm text-[var(--color-tv-text-2)]">
                  Phase C will wire up the state-machine transitions here:
                  advance to consent capture, evidence gathering, synthesis,
                  decision drafting, and so on. Each transition will write a{" "}
                  <code className="font-mono">case.state.changed</code> audit
                  event.
                </p>
                <div className="mt-4 flex gap-2">
                  <span className="inline-flex cursor-not-allowed items-center rounded-md border border-[var(--color-tv-border)] bg-[var(--color-tv-surface-2)] px-3 py-2 text-sm font-semibold text-[var(--color-tv-text-3)]">
                    Advance state (next phase)
                  </span>
                </div>
              </Card>
            </div>

            <div className="flex flex-col gap-6">
              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Required check set ({roleProfile.requiredCheckSet.length})
                </h2>
                <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                  {roleProfile.requiredCheckSet.map((c) => (
                    <li key={c}>
                      ✓ <span className="ml-1">{c.replace(/_/g, " ")}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.06em] text-[var(--color-tv-text-3)]">
        {label}
      </dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}
