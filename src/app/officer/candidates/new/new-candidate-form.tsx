"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { createCandidateAction } from "../actions";

export function NewCandidateForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createCandidateAction({
        displayName: displayName.trim(),
        primaryEmail: primaryEmail.trim(),
        primaryPhone: primaryPhone.trim(),
      });

      if (!result.ok) {
        setError(result.error ?? "Could not create candidate.");
        return;
      }

      router.push(`/officer/candidates/${result.candidateId}` as never);
      router.refresh();
    });
  }

  const valid =
    displayName.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(primaryEmail.trim());

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl">
      <Card className="p-6">
        <h2 className="text-xs font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-text-2)]">
          Identity
        </h2>
        <div className="mt-4 flex flex-col gap-4">
          <Field label="Display name" required>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Helen Park"
              className="rounded-md border border-[var(--color-tv-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-tv-accent)] focus:outline-none"
              required
            />
          </Field>
          <Field label="Primary email" required>
            <input
              type="email"
              value={primaryEmail}
              onChange={(e) => setPrimaryEmail(e.target.value)}
              placeholder="helen.park@example.com"
              className="rounded-md border border-[var(--color-tv-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-tv-accent)] focus:outline-none"
              required
            />
          </Field>
          <Field label="Primary phone (optional)">
            <input
              type="tel"
              value={primaryPhone}
              onChange={(e) => setPrimaryPhone(e.target.value)}
              placeholder="+61 4xx xxx xxx"
              className="rounded-md border border-[var(--color-tv-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-tv-accent)] focus:outline-none"
            />
          </Field>
        </div>

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
          <Button type="submit" disabled={!valid || isPending}>
            {isPending ? "Creating…" : "Create candidate"}
          </Button>
        </div>
      </Card>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-[var(--color-tv-text-2)]">
        {label}
        {required && <span className="ml-1 text-[var(--color-tv-danger)]">*</span>}
      </span>
      {children}
    </label>
  );
}
