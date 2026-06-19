/**
 * Case service.
 *
 * A Case is the central screening unit: it joins a candidate to a role
 * profile version, walks through the lifecycle state machine, and ends
 * with a Decision (or withdrawal).
 *
 * For Phase B: only open + read are implemented. Phase C adds the
 * state-machine transitions.
 */

import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/db";
import {
  cases,
  candidates,
  roleProfiles,
  type Case,
  type Candidate,
  type RoleProfile,
} from "@/db/schema";
import { recordEvent } from "@/lib/audit";
import {
  actorFromContext,
  ForbiddenError,
  type RequestContext,
} from "@/lib/tenant";

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------

export interface CaseListRow extends Case {
  candidateDisplayName: string;
  roleTitle: string;
}

export async function listCasesForTenant(
  ctx: RequestContext,
): Promise<CaseListRow[]> {
  const rows = await db
    .select({
      caseRow: cases,
      candidateDisplayName: candidates.displayName,
      roleTitle: roleProfiles.title,
    })
    .from(cases)
    .innerJoin(candidates, eq(candidates.candidateId, cases.candidateId))
    .innerJoin(
      roleProfiles,
      eq(roleProfiles.roleProfileId, cases.roleProfileId),
    )
    .where(eq(cases.tenantId, ctx.tenant.tenantId))
    .orderBy(desc(cases.openedAt));

  return rows.map((r) => ({
    ...r.caseRow,
    candidateDisplayName: r.candidateDisplayName,
    roleTitle: r.roleTitle,
  }));
}

export async function listCasesForCandidate(
  ctx: RequestContext,
  candidateId: string,
): Promise<CaseListRow[]> {
  const rows = await db
    .select({
      caseRow: cases,
      candidateDisplayName: candidates.displayName,
      roleTitle: roleProfiles.title,
    })
    .from(cases)
    .innerJoin(candidates, eq(candidates.candidateId, cases.candidateId))
    .innerJoin(
      roleProfiles,
      eq(roleProfiles.roleProfileId, cases.roleProfileId),
    )
    .where(
      and(
        eq(cases.tenantId, ctx.tenant.tenantId),
        eq(cases.candidateId, candidateId),
      ),
    )
    .orderBy(desc(cases.openedAt));

  return rows.map((r) => ({
    ...r.caseRow,
    candidateDisplayName: r.candidateDisplayName,
    roleTitle: r.roleTitle,
  }));
}

export interface CaseDetailRow {
  caseRow: Case;
  candidate: Candidate;
  roleProfile: RoleProfile;
}

export async function getCaseById(
  ctx: RequestContext,
  caseId: string,
): Promise<CaseDetailRow | null> {
  const rows = await db
    .select({
      caseRow: cases,
      candidate: candidates,
      roleProfile: roleProfiles,
    })
    .from(cases)
    .innerJoin(candidates, eq(candidates.candidateId, cases.candidateId))
    .innerJoin(
      roleProfiles,
      eq(roleProfiles.roleProfileId, cases.roleProfileId),
    )
    .where(
      and(
        eq(cases.caseId, caseId),
        eq(cases.tenantId, ctx.tenant.tenantId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// -------------------------------------------------------------------------
// Writes
// -------------------------------------------------------------------------

export interface OpenCaseInput {
  candidateId: string;
  roleProfileId: string;
}

export async function openCase(args: {
  ctx: RequestContext;
  input: OpenCaseInput;
}): Promise<Case> {
  const { ctx, input } = args;

  // Verify the candidate and role exist in this tenant.
  const cand = await db
    .select()
    .from(candidates)
    .where(
      and(
        eq(candidates.candidateId, input.candidateId),
        eq(candidates.tenantId, ctx.tenant.tenantId),
      ),
    )
    .limit(1);
  if (!cand[0]) throw new ForbiddenError("candidate not found");

  const role = await db
    .select()
    .from(roleProfiles)
    .where(
      and(
        eq(roleProfiles.roleProfileId, input.roleProfileId),
        eq(roleProfiles.tenantId, ctx.tenant.tenantId),
      ),
    )
    .limit(1);
  if (!role[0]) throw new ForbiddenError("role not found");

  const caseId = `case_${ulid()}`;

  const inserted = await db
    .insert(cases)
    .values({
      caseId,
      tenantId: ctx.tenant.tenantId,
      candidateId: input.candidateId,
      roleProfileId: input.roleProfileId,
      roleProfileVersion: role[0].version,
      type: "initial",
      scope: [],
      state: "draft",
    })
    .returning();

  const row = inserted[0];
  if (!row) throw new Error("failed to open case");

  await recordEvent({
    type: "case.opened",
    tenantId: ctx.tenant.tenantId,
    actor: actorFromContext(ctx),
    subject: { entityType: "case", entityId: caseId },
    caseId,
    after: {
      candidateId: row.candidateId,
      roleProfileId: row.roleProfileId,
      roleTitle: role[0].title,
      candidateDisplayName: cand[0].displayName,
      initialState: row.state,
    },
  });

  return row;
}

// -------------------------------------------------------------------------
// Active roles (for the role-picker on case open)
// -------------------------------------------------------------------------

export async function listOpenableRolesForTenant(
  ctx: RequestContext,
): Promise<RoleProfile[]> {
  return db
    .select()
    .from(roleProfiles)
    .where(eq(roleProfiles.tenantId, ctx.tenant.tenantId))
    .orderBy(desc(roleProfiles.createdAt));
}
