/**
 * Candidate service.
 *
 * Candidates are people being assessed. Distinct from `workforcePersons`,
 * which are post-decision people already inside the org boundary.
 *
 * For the prototype: minimal identity fields only. Full intake (verified
 * identity reference, identity-doc evidence, consent records) lands in
 * later cards.
 */

import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/db";
import { candidates, type Candidate } from "@/db/schema";
import { recordEvent } from "@/lib/audit";
import { actorFromContext, type RequestContext } from "@/lib/tenant";

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------

export async function listCandidatesForTenant(
  ctx: RequestContext,
): Promise<Candidate[]> {
  return db
    .select()
    .from(candidates)
    .where(eq(candidates.tenantId, ctx.tenant.tenantId))
    .orderBy(desc(candidates.createdAt));
}

export async function getCandidateById(
  ctx: RequestContext,
  candidateId: string,
): Promise<Candidate | null> {
  const row = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.candidateId, candidateId),
        eq(candidates.tenantId, ctx.tenant.tenantId),
      ),
    )
    .limit(1);
  return row[0] ?? null;
}

// -------------------------------------------------------------------------
// Writes
// -------------------------------------------------------------------------

export interface CreateCandidateInput {
  displayName: string;
  primaryEmail: string;
  primaryPhone?: string | null;
}

export async function createCandidate(args: {
  ctx: RequestContext;
  input: CreateCandidateInput;
}): Promise<Candidate> {
  const { ctx, input } = args;

  const candidateId = `cand_${ulid()}`;

  const inserted = await db
    .insert(candidates)
    .values({
      candidateId,
      tenantId: ctx.tenant.tenantId,
      displayName: input.displayName,
      primaryEmail: input.primaryEmail,
      primaryPhone: input.primaryPhone ?? null,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new Error("failed to create candidate");
  }

  await recordEvent({
    type: "candidate.created",
    tenantId: ctx.tenant.tenantId,
    actor: actorFromContext(ctx),
    subject: { entityType: "candidate", entityId: candidateId },
    after: {
      displayName: row.displayName,
      primaryEmail: row.primaryEmail,
    },
  });

  return row;
}
