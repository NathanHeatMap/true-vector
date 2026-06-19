"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { openCaseAction } from "../actions";

interface CandidateOpt {
  candidateId: string;
  displayName: string;
  primaryEmail: string;
}

interface RoleOpt {
  roleProfileId: string;
  title: string;
  version: number;
  computedTier: string;
  status: string;
}

export function OpenCasePicker({
  candidates,
  roles,
  preselectedCandidateId,
  preselectedRoleProfileId,
}: {
  candidates: CandidateOpt[];
  roles: RoleOpt[];
  preselectedCandidateId?: string;
  preselectedRoleProfileId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [candidateId, setCandidateId] = useState(
    preselectedCandidateId ?? "",
  );
  const [roleProfileId, setRoleProfileId] = useState(
    preselectedRoleProfileId ?? "",
  );

  const selectedCand = candidates.find((c) => c.candidateId === candidateId);
  const selectedRole = roles.find((r) => r.roleProfileId === roleProfileId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!candidateId || !roleProfileId) {
      setError("Pick a candidate and a role.");
      return;
    }
    startTransition(async () => {
      const result = await openCaseAction({ candidateId, roleProfileId });
      if (!result.ok) {
        setError(result.error ?? "Could not open case.");
        return;
      }
      router.push(`/officer/cases/${result.caseId}` as never);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl">
      <Card className="p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--color-tv-text-2)]">
                Candidate
              </span>
              <select
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
                className="rounded-md border border-[var(--color-tv-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-tv-accent)] focus:outline-none"
              >
                <option value="">— Select a candidate —</option>
                {candidates.map((c) => (
                  <option key={c.candidateId} value={c.candidateId}>
                    {c.displayName} ({c.primaryEmail})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--color-tv-text-2)]">
                Role
              </span>
              <select
                value={roleProfileId}
                onChange={(e) => setRoleProfileId(e.target.value)}
                className="rounded-md border border-[var(--color-tv-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-tv-accent)] focus:outline-none"
              >
                <option value="">— Select a role —</option>
                {roles.map((r) => (
                  <option key={r.roleProfileId} value={r.roleProfileId}>
                    {r.title} (v{r.version} · {r.computedTier} tier · {r.status})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {(selectedCand || selectedRole) && (
          <div className="mt-6 rounded-md border border-[var(--color-tv-border-soft)] bg-[var(--color-tv-surface-2)] p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
              About to open
            </p>
            <p className="mt-2">
              Screening case{" "}
              <span className="font-semibold">
                {selectedCand?.displayName ?? "(pick a candidate)"}
              </span>{" "}
              against role{" "}
              <span className="font-semibold">
                {selectedRole?.title ?? "(pick a role)"}
                {selectedRole && ` v${selectedRole.version}`}
              </span>
              .
            </p>
            <p className="mt-2 text-xs text-[var(--color-tv-text-3)]">
              Initial state: Draft. Audit event{" "}
              <code className="font-mono">case.opened</code> will be written.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-md border border-[var(--color-tv-danger)] bg-[var(--color-tv-danger-soft)] px-3 py-2 text-sm text-[var(--color-tv-danger)]">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => history.back()}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!candidateId || !roleProfileId || isPending}
          >
            {isPending ? "Opening…" : "Open case"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
