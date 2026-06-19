export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CaseStatePill } from "@/components/ui/state-pill";
import { getCandidateById } from "@/lib/candidate";
import { listCasesForCandidate } from "@/lib/case";
import { requireRole } from "@/lib/tenant";

export const metadata = { title: "Candidate detail" };

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole(["officer", "owner", "hr"]);
  const candidate = await getCandidateById(ctx, id);
  if (!candidate) notFound();
  const cases = await listCasesForCandidate(ctx, id);

  return (
    <>
      <Topbar
        breadcrumbs={[
          { label: "Home", href: "/officer" },
          { label: "Candidates", href: "/officer/candidates" },
          { label: candidate.displayName },
        ]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="candidates" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{candidate.displayName}</h1>
              <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
                Added {new Date(candidate.createdAt).toLocaleString("en-AU")}
              </p>
            </div>
            <Button asChild>
              <Link
                href={`/officer/cases/new?candidateId=${candidate.candidateId}` as never}
              >
                + Open case
              </Link>
            </Button>
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
            <div className="flex flex-col gap-6">
              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Identity
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <Field label="Email" value={candidate.primaryEmail} />
                  <Field
                    label="Phone"
                    value={candidate.primaryPhone ?? "(not provided)"}
                  />
                  <Field
                    label="Verified ID ref"
                    value={candidate.verifiedIdentityRef ?? "(not yet verified)"}
                  />
                  <Field label="Candidate ID" value={candidate.candidateId} mono />
                </dl>
              </Card>

              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Cases ({cases.length})
                </h2>
                {cases.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--color-tv-text-2)]">
                    No cases opened yet. Open one to begin screening this
                    candidate against a role.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {cases.map((c) => (
                      <li
                        key={c.caseId}
                        className="flex items-center justify-between rounded-md border border-[var(--color-tv-border-soft)] bg-[var(--color-tv-surface-2)] px-3 py-2.5 text-sm"
                      >
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold">{c.roleTitle}</span>
                          <div className="flex items-center gap-2">
                            <CaseStatePill state={c.state} />
                            <span className="text-xs text-[var(--color-tv-text-3)]">
                              opened{" "}
                              {new Date(c.openedAt).toLocaleDateString("en-AU")}
                            </span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/officer/cases/${c.caseId}` as never}>
                            Open
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <div className="flex flex-col gap-6">
              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Status
                </h2>
                <p className="mt-3 text-sm">
                  {cases.some((c) => !c.state.startsWith("closed_"))
                    ? "Active screening in progress."
                    : "No active screening."}
                </p>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.06em] text-[var(--color-tv-text-3)]">
        {label}
      </dt>
      <dd
        className={
          mono
            ? "mt-1 font-mono text-xs text-[var(--color-tv-text-2)]"
            : "mt-1 text-sm"
        }
      >
        {value}
      </dd>
    </div>
  );
}
