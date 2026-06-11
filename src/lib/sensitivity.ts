/**
 * Field-level sensitivity tags.
 *
 * Every PII or assessment field carries a tag. Field access goes through
 * `redactSensitive()` which strips fields the caller's role isn't allowed
 * to see. This is the cheapest correct seam for compliance — it lets the
 * data layer hand back full rows without each caller having to know which
 * fields to strip.
 *
 * Tags mirror the conventions described in domain_model_v0.1.md §1.
 */

import type { WorkforceRole } from "@/lib/tenant";

export type SensitivityTag =
  | "public" // anyone with auth can see it
  | "internal" // any tenant member
  | "pii.identity" // names, contact details, identity documents
  | "pii.financial" // bank statements, credit info
  | "pii.medical" // mental-health events affecting suitability
  | "assessment.adverse" // adverse-finding content
  | "system"; // platform internals (hashes, internal IDs)

/**
 * Allowed-tag policy per role. The set of tags this role can READ.
 * Writes are gated separately by the action-level role check.
 */
const READ_POLICY: Record<WorkforceRole, ReadonlyArray<SensitivityTag>> = {
  officer: ["public", "internal", "pii.identity", "pii.financial", "pii.medical", "assessment.adverse", "system"],
  adjudicator: ["public", "internal", "pii.identity", "pii.financial", "pii.medical", "assessment.adverse", "system"],
  analyst: ["public", "internal", "pii.identity", "assessment.adverse"],
  owner: ["public", "internal", "pii.identity", "assessment.adverse", "system"],
  auditor: ["public", "internal", "pii.identity", "pii.financial", "pii.medical", "assessment.adverse", "system"],
  hr: ["public", "internal", "pii.identity"],
  candidate: ["public", "internal"],
};

/**
 * Take a record + a map of which fields carry which tags, and strip any field
 * whose tag isn't readable by the supplied roles.
 *
 * Stripped fields are REPLACED with `null` so the caller can render an
 * appropriate "redacted" UI rather than the field appearing to be missing.
 *
 * Usage:
 *   const safe = redactSensitive(rawCandidate, candidateFieldTags, ctx.roles);
 */
export function redactSensitive<T extends Record<string, unknown>>(
  record: T,
  fieldTags: Partial<Record<keyof T, SensitivityTag>>,
  roles: ReadonlyArray<WorkforceRole>,
): T {
  const allowedTags = new Set<SensitivityTag>();
  for (const role of roles) {
    for (const tag of READ_POLICY[role]) allowedTags.add(tag);
  }

  const out = { ...record };
  for (const [field, tag] of Object.entries(fieldTags) as Array<
    [keyof T, SensitivityTag]
  >) {
    if (!allowedTags.has(tag)) {
      (out as Record<string, unknown>)[field as string] = null;
    }
  }
  return out;
}

/**
 * Tag declarations for common entities. Add as new entities come into scope.
 */

export const candidateFieldTags = {
  candidateId: "public",
  tenantId: "system",
  displayName: "pii.identity",
  primaryEmail: "pii.identity",
  primaryPhone: "pii.identity",
  verifiedIdentityRef: "pii.identity",
  createdAt: "internal",
} as const satisfies Partial<Record<string, SensitivityTag>>;

export const workforcePersonFieldTags = {
  personId: "public",
  tenantId: "system",
  clerkUserId: "system",
  displayName: "pii.identity",
  primaryEmail: "pii.identity",
  type: "internal",
  status: "internal",
  originalCaseId: "internal",
  currentRoleId: "internal",
  assessorProfile: "internal",
  screeningCurrency: "internal",
} as const satisfies Partial<Record<string, SensitivityTag>>;
