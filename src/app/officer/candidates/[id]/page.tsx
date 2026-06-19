export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Card } from "@/components/ui/card";
import { getCandidateById } from "@/lib/candidate";
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
          <header className="mb-6">
            <h1 className="text-2xl font-bold">{candidate.displayName}</h1>
            <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
              Added {new Date(candidate.createdAt).toLocaleString("en-AU")}
            </p>
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
                  Cases
                </h2>
                <p className="mt-3 text-sm text-[var(--color-tv-text-2)]">
                  No cases opened for this candidate yet. Open one to begin
                  screening.
                </p>
                <div className="mt-4">
                  <span className="inline-flex cursor-not-allowed items-center rounded-md border border-[var(--color-tv-border)] bg-[var(--color-tv-surface-2)] px-3 py-2 text-sm font-semibold text-[var(--color-tv-text-3)]">
                    Open case (next phase)
                  </span>
                </div>
              </Card>
            </div>

            <div className="flex flex-col gap-6">
              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Status
                </h2>
                <p className="mt-3 text-sm">
                  No active screening. Candidate is captured but no consent or
                  evidence has been gathered.
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
