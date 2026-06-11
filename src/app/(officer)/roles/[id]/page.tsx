import { notFound } from "next/navigation";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { RoleProfileStatePill } from "@/components/ui/state-pill";
import { getRoleProfileById } from "@/lib/role-profile";
import { requireRole } from "@/lib/tenant";

import { RoleDetailActions } from "./role-detail-actions";

export const metadata = { title: "Role detail" };

interface RiskAssessment {
  accessLevel: string;
  frequency: string;
  duration: string;
  impactScores: Record<string, number>;
  rationale: string;
}

interface PDInsertions {
  screeningClause: string;
  ongoingObligationsClause: string;
  confidentialityClause: string;
  coiClause: string;
}

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRole(["officer", "owner"]);
  const role = await getRoleProfileById(ctx, id);
  if (!role) notFound();

  const risk = role.riskAssessment as RiskAssessment;
  const pd = role.pdInsertions as PDInsertions;
  const checks = role.requiredCheckSet;

  return (
    <>
      <Topbar
        breadcrumbs={[
          { label: "Home", href: "/officer" },
          { label: "Roles", href: "/officer/roles" },
          { label: role.title },
        ]}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar section="roles" />
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <header className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">{role.title}</h1>
              <p className="mt-1 text-sm text-[var(--color-tv-text-2)]">
                v{role.version} · created{" "}
                {new Date(role.createdAt).toLocaleString("en-AU")} ·{" "}
                {role.createdByAgent ? "drafted with RR Agent" : "drafted manually"}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <RoleProfileStatePill state={role.status} />
                <Badge tone={tierTone(role.computedTier)}>
                  {role.computedTier.toUpperCase()} TIER
                </Badge>
                <Badge tone="neutral">{role.revalidationCadence}</Badge>
              </div>
            </div>
            <RoleDetailActions roleProfileId={role.roleProfileId} status={role.status} />
          </header>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_440px]">
            {/* LEFT: description + risk + check set */}
            <div className="flex flex-col gap-6">
              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Description
                </h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                  {role.description}
                </p>
              </Card>

              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Risk assessment
                </h2>
                <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                  <Field label="Access level" value={risk.accessLevel} />
                  <Field label="Frequency" value={risk.frequency} />
                  <Field label="Duration" value={risk.duration} />
                </div>
                <p className="mt-4 text-xs font-medium uppercase tracking-[0.06em] text-[var(--color-tv-text-2)]">
                  Impact scores (1–5)
                </p>
                <div className="mt-2 grid grid-cols-5 gap-3 text-sm">
                  {Object.entries(risk.impactScores).map(([k, v]) => (
                    <div key={k}>
                      <p className="text-xs text-[var(--color-tv-text-3)]">{k}</p>
                      <p className="text-lg font-semibold">{v}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-md border border-[var(--color-tv-border-soft)] bg-[var(--color-tv-surface-2)] p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--color-tv-text-2)]">
                    Rationale
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">{risk.rationale}</p>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  Required check set ({checks.length})
                </h2>
                <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                  {checks.map((c) => (
                    <li key={c}>
                      ✓ <span className="ml-1">{c.replace(/_/g, " ")}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* RIGHT: PD insertions + sign-off panel */}
            <div className="flex flex-col gap-6">
              <Card className="p-6">
                <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
                  PD insertions
                </h2>
                <div className="mt-3 flex flex-col gap-4 text-sm">
                  <PDField label="Screening clause" value={pd.screeningClause} />
                  <PDField label="Ongoing obligations" value={pd.ongoingObligationsClause} />
                  <PDField label="Confidentiality" value={pd.confidentialityClause} />
                  <PDField label="Conflict of interest" value={pd.coiClause} />
                </div>
              </Card>

              {role.status === "active" && (
                <Card className="border-[var(--color-tv-success)] p-6">
                  <p className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-success)]">
                    Active
                  </p>
                  <p className="mt-2 text-sm">
                    This role is accepting candidate applications.
                  </p>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

function tierTone(
  tier: string,
): "neutral" | "accentSoft" | "warn" | "danger" {
  if (tier === "low") return "neutral";
  if (tier === "medium") return "accentSoft";
  if (tier === "high") return "warn";
  return "danger";
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.06em] text-[var(--color-tv-text-3)]">
        {label}
      </p>
      <p className="mt-1">{value}</p>
    </div>
  );
}

function PDField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--color-tv-text-2)]">
        {label}
      </p>
      <p className="mt-1 leading-relaxed text-[var(--color-tv-text)]">
        {value || (
          <span className="italic text-[var(--color-tv-text-3)]">
            (not yet drafted)
          </span>
        )}
      </p>
    </div>
  );
}
