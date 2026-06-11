"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import {
  scoreAndCreateRole,
  type ScoreAndCreateInput,
} from "../actions";

/**
 * New-role form.
 *
 * Officer enters:
 *   - Title
 *   - Description (rich enough for RR to reason about)
 *   - Asset access entries (type + value + criticality + notes)
 *
 * Then clicks "Run Risk Assessment". RR fills in the computed tier, check
 * set, cadence, PD insertions. We persist the draft and redirect to the
 * detail page for review.
 *
 * For prototype simplicity: impact scores + access level / frequency etc.
 * are produced by RR rather than collected from the form. Officers can
 * override later on the detail page.
 */

const ASSET_TYPES = [
  "people",
  "system",
  "facility",
  "sensitive-information",
  "infrastructure",
  "weapon",
  "funds",
  "ip",
] as const;
type AssetType = (typeof ASSET_TYPES)[number];

interface AssetRow {
  id: string;
  assetType: AssetType;
  value: number;
  criticality: number;
  notes: string;
}

export function NewRoleForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assets, setAssets] = useState<AssetRow[]>([
    {
      id: crypto.randomUUID(),
      assetType: "sensitive-information",
      value: 3,
      criticality: 3,
      notes: "",
    },
  ]);
  const [error, setError] = useState<string | null>(null);

  function addAsset() {
    setAssets((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        assetType: "system",
        value: 3,
        criticality: 3,
        notes: "",
      },
    ]);
  }

  function removeAsset(id: string) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function patchAsset(id: string, patch: Partial<AssetRow>) {
    setAssets((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input: ScoreAndCreateInput = {
      title: title.trim(),
      description: description.trim(),
      assets: assets.map(({ id: _, ...rest }) => rest),
    };
    if (input.title.length < 3) {
      setError("Title must be at least 3 characters.");
      return;
    }
    if (input.description.length < 20) {
      setError("Description must be at least 20 characters — RR needs context to assess.");
      return;
    }
    startTransition(async () => {
      const result = await scoreAndCreateRole(input);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push(`/officer/roles/${result.roleProfileId}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_440px]">
      {/* LEFT: form */}
      <Card className="p-6">
        <h2 className="text-base font-semibold">Role details</h2>
        <p className="mt-1 text-xs text-[var(--color-tv-text-2)]">
          Describe the role; the agent will score risk and propose a check set.
        </p>

        <div className="mt-6 flex flex-col gap-1.5">
          <label
            htmlFor="title"
            className="text-xs font-medium text-[var(--color-tv-text-2)]"
          >
            ROLE TITLE
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            placeholder="e.g. Senior Software Engineer (Adelaide)"
            className="h-10 rounded-md border border-[var(--color-tv-border)] px-3 text-sm focus:border-[var(--color-tv-accent)] focus:outline-none"
          />
        </div>

        <div className="mt-5 flex flex-col gap-1.5">
          <label
            htmlFor="description"
            className="text-xs font-medium text-[var(--color-tv-text-2)]"
          >
            DESCRIPTION
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={pending}
            rows={6}
            placeholder="What does the role do? Who do they work with? What systems and information do they access? Be specific — RR needs context to assess."
            className="rounded-md border border-[var(--color-tv-border)] p-3 text-sm focus:border-[var(--color-tv-accent)] focus:outline-none"
          />
        </div>

        <div className="mt-6">
          <div className="flex items-end justify-between">
            <div>
              <label className="text-xs font-medium text-[var(--color-tv-text-2)]">
                ASSETS THIS ROLE ACCESSES
              </label>
              <p className="text-[11px] text-[var(--color-tv-text-3)]">
                Value 1-5 (how valuable to the org), Criticality 1-5 (how bad if compromised).
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addAsset}
              disabled={pending}
            >
              + Add asset
            </Button>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            {assets.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[1fr_64px_64px_1fr_auto] items-center gap-2 rounded-md border border-[var(--color-tv-border-soft)] bg-[var(--color-tv-surface-2)] p-2"
              >
                <select
                  value={a.assetType}
                  onChange={(e) =>
                    patchAsset(a.id, { assetType: e.target.value as AssetType })
                  }
                  disabled={pending}
                  className="h-9 rounded-md border border-[var(--color-tv-border)] bg-white px-2 text-sm"
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={a.value}
                  onChange={(e) =>
                    patchAsset(a.id, { value: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })
                  }
                  aria-label="value 1-5"
                  disabled={pending}
                  className="h-9 rounded-md border border-[var(--color-tv-border)] bg-white px-2 text-center text-sm"
                />
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={a.criticality}
                  onChange={(e) =>
                    patchAsset(a.id, {
                      criticality: Math.max(1, Math.min(5, Number(e.target.value) || 1)),
                    })
                  }
                  aria-label="criticality 1-5"
                  disabled={pending}
                  className="h-9 rounded-md border border-[var(--color-tv-border)] bg-white px-2 text-center text-sm"
                />
                <input
                  type="text"
                  value={a.notes}
                  onChange={(e) => patchAsset(a.id, { notes: e.target.value })}
                  disabled={pending}
                  placeholder="optional notes…"
                  className="h-9 rounded-md border border-[var(--color-tv-border)] bg-white px-2 text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAsset(a.id)}
                  disabled={pending || assets.length === 1}
                  aria-label="Remove asset"
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-md border border-[var(--color-tv-danger)] bg-[var(--color-tv-danger-soft)] p-3 text-sm text-[var(--color-tv-danger)]"
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={pending} asChild>
            <a href="/officer/roles">Cancel</a>
          </Button>
          <Button type="submit" variant="accent" disabled={pending}>
            {pending ? "Running Risk Assessment…" : "↻ Run Risk Assessment (~10 sec)"}
          </Button>
        </div>
      </Card>

      {/* RIGHT: explainer panel — gets replaced by RR output on the detail page */}
      <Card className="border-[var(--color-tv-accent)] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-[var(--color-tv-accent)]">
          What happens next
        </p>
        <h3 className="mt-3 text-base font-semibold">
          The Role Risk Agent reads your inputs.
        </h3>
        <ul className="mt-4 flex flex-col gap-3 text-sm text-[var(--color-tv-text-2)]">
          <li className="flex gap-3">
            <span className="font-semibold text-[var(--color-tv-text)]">1.</span>
            <span>Scores impact across financial, reputation, client-harm, product-quality, and competitiveness.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-[var(--color-tv-text)]">2.</span>
            <span>Computes a risk tier (low / medium / high / critical) and explains why in plain English.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-[var(--color-tv-text)]">3.</span>
            <span>Selects the required check set: identity, address history, references, public footprint check, etc.</span>
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-[var(--color-tv-text)]">4.</span>
            <span>Drafts the Position Description clauses for screening, ongoing obligations, confidentiality, and COI.</span>
          </li>
        </ul>
        <p className="mt-5 text-xs text-[var(--color-tv-text-3)]">
          You can edit any field before submitting for sign-off. High-tier roles require a sign-off from someone other than the drafter.
        </p>
      </Card>
    </form>
  );
}
