"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { advanceCaseStateAction } from "../actions";

interface Transition {
  to: string;
  label: string;
}

/**
 * Renders the set of advance buttons appropriate for the current state.
 * Each click writes an audit event via `advanceCaseStateAction` and Next.js
 * revalidates the page automatically.
 */
export function CaseAdvanceActions({
  caseId,
  transitions,
}: {
  caseId: string;
  transitions: ReadonlyArray<Transition>;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyTarget, setBusyTarget] = useState<string | null>(null);

  if (transitions.length === 0) {
    return (
      <p className="text-sm text-[var(--color-tv-text-2)]">
        Terminal state — no further transitions.
      </p>
    );
  }

  function handleAdvance(toState: string) {
    setError(null);
    setBusyTarget(toState);
    startTransition(async () => {
      const result = await advanceCaseStateAction({
        caseId,
        toState: toState as never,
      });
      setBusyTarget(null);
      if (!result.ok) {
        setError(result.error ?? "Could not advance state.");
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => {
          const isClose = t.to.startsWith("closed_");
          const isWithdraw = t.to === "closed_withdrawn";
          return (
            <Button
              key={t.to}
              variant={isWithdraw ? "danger" : isClose ? "primary" : "accent"}
              size="sm"
              disabled={isPending}
              onClick={() => handleAdvance(t.to)}
            >
              {busyTarget === t.to ? "Working…" : t.label}
            </Button>
          );
        })}
      </div>
      {error && (
        <div className="mt-3 rounded-md border border-[var(--color-tv-danger)] bg-[var(--color-tv-danger-soft)] px-3 py-2 text-sm text-[var(--color-tv-danger)]">
          {error}
        </div>
      )}
    </div>
  );
}
