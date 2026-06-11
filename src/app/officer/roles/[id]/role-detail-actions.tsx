"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

import { retireRole, signOffRole, submitDraftForSignOff } from "../actions";

interface Props {
  roleProfileId: string;
  status: "draft" | "pending_sign_off" | "active" | "retired";
}

/**
 * Action buttons on the role detail page.
 * Behaviour changes by state:
 *   - draft → "Submit for sign-off"
 *   - pending_sign_off → "Sign off & activate" (with rationale modal)
 *   - active → "Retire"
 *   - retired → no actions
 */
export function RoleDetailActions({ roleProfileId, status }: Props) {
  const [pending, startTransition] = useTransition();
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (status === "draft") {
    return (
      <Button
        disabled={pending}
        onClick={() => startTransition(() => submitDraftForSignOff(roleProfileId))}
      >
        {pending ? "Submitting…" : "Submit for sign-off"}
      </Button>
    );
  }

  if (status === "pending_sign_off") {
    return (
      <div className="flex flex-col items-end gap-2">
        {!signOffOpen ? (
          <Button onClick={() => setSignOffOpen(true)} disabled={pending}>
            Sign off &amp; activate
          </Button>
        ) : (
          <div className="flex w-[440px] flex-col gap-2 rounded-md border border-[var(--color-tv-border)] bg-white p-4">
            <label htmlFor="rationale" className="text-xs font-medium text-[var(--color-tv-text-2)]">
              SIGN-OFF RATIONALE (min 30 chars · recorded in audit log)
            </label>
            <textarea
              id="rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={3}
              disabled={pending}
              placeholder="Why you're signing this off as a pre-advertise gate decision."
              className="rounded-md border border-[var(--color-tv-border)] p-2 text-sm focus:border-[var(--color-tv-accent)] focus:outline-none"
            />
            {error && (
              <p className="text-xs text-[var(--color-tv-danger)]">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSignOffOpen(false);
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={pending || rationale.trim().length < 30}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await signOffRole({ roleProfileId, rationale });
                    if (!result.ok) {
                      setError(result.error ?? "Sign-off failed");
                      return;
                    }
                    setSignOffOpen(false);
                    setRationale("");
                  });
                }}
              >
                Sign off &amp; activate
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (status === "active") {
    return (
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => startTransition(() => retireRole(roleProfileId))}
      >
        Retire role
      </Button>
    );
  }

  return null;
}
