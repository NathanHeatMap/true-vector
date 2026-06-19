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

// -------------------------------------------------------------------------
// State machine — happy-path lifecycle for the prototype
// -------------------------------------------------------------------------

type CaseState =
  | "draft"
  | "consent_pending"
  | "evidence_gathering"
  | "evidence_held"
  | "synthesis"
  | "decision_drafting"
  | "right_of_reply"
  | "adjudication_pending"
  | "appeal"
  | "closed_suitable"
  | "closed_unsuitable"
  | "closed_conditional"
  | "closed_withdrawn";

/**
 * Allowed transitions per state. Prototype scope: happy-path + withdraw.
 * Production scope (later cards) will add: evidence_held loop, right_of_reply,
 * adjudication, appeal, conditional close paths.
 */
const TRANSITIONS: Record<CaseState, Array<{ to: CaseState; label: string }>> = {
  draft: [{ to: "consent_pending", label: "Request candidate consent" }],
  consent_pending: [
    { to: "evidence_gathering", label: "Consent received — begin evidence" },
    { to: "closed_withdrawn", label: "Withdraw case" },
  ],
  evidence_gathering: [
    { to: "synthesis", label: "Evidence complete — synthesise" },
    { to: "closed_withdrawn", label: "Withdraw case" },
  ],
  evidence_held: [
    { to: "evidence_gathering", label: "Resume evidence gathering" },
    { to: "closed_withdrawn", label: "Withdraw case" },
  ],
  synthesis: [
    { to: "decision_drafting", label: "Draft decision" },
    { to: "closed_withdrawn", label: "Withdraw case" },
  ],
  decision_drafting: [
    { to: "closed_suitable", label: "Render: Suitable" },
    { to: "closed_unsuitable", label: "Render: Unsuitable" },
    { to: "closed_conditional", label: "Render: Conditional" },
    { to: "closed_withdrawn", label: "Withdraw case" },
  ],
  right_of_reply: [
    { to: "adjudication_pending", label: "Escalate to adjudication" },
    { to: "closed_suitable", label: "Render: Suitable" },
    { to: "closed_unsuitable", label: "Render: Unsuitable" },
  ],
  adjudication_pending: [
    { to: "closed_suitable", label: "Adjudicate: Suitable" },
    { to: "closed_unsuitable", label: "Adjudicate: Unsuitable" },
    { to: "closed_conditional", label: "Adjudicate: Conditional" },
    { to: "appeal", label: "Open appeal" },
  ],
  appeal: [
    { to: "closed_suitable", label: "Appeal: Suitable" },
    { to: "closed_unsuitable", label: "Appeal: Unsuitable" },
  ],
  closed_suitable: [],
  closed_unsuitable: [],
  closed_conditional: [],
  closed_withdrawn: [],
};

export function allowedTransitionsFor(state: CaseState): ReadonlyArray<{
  to: CaseState;
  label: string;
}> {
  return TRANSITIONS[state] ?? [];
}

export class InvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transition not allowed: ${from} \u2192 ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export async function advanceCaseState(args: {
  ctx: RequestContext;
  caseId: string;
  toState: CaseState;
  note?: string;
}): Promise<Case> {
  const { ctx, caseId, toState } = args;

  const current = await db
    .select()
    .from(cases)
    .where(
      and(
        eq(cases.caseId, caseId),
        eq(cases.tenantId, ctx.tenant.tenantId),
      ),
    )
    .limit(1);

  const existing = current[0];
  if (!existing) throw new ForbiddenError("case not found");

  const allowed = (TRANSITIONS[existing.state as CaseState] ?? []).some(
    (t) => t.to === toState,
  );
  if (!allowed) {
    throw new InvalidTransitionError(existing.state, toState);
  }

  const isClosed = toState.startsWith("closed_");
  const closedAt = isClosed ? new Date().toISOString() : null;

  const updated = await db
    .update(cases)
    .set({
      state: toState,
      ...(isClosed ? { closedAt } : {}),
    })
    .where(eq(cases.caseId, caseId))
    .returning();

  const row = updated[0];
  if (!row) throw new Error("failed to advance case state");

  await recordEvent({
    type: isClosed ? "case.closed" : "case.state.changed",
    tenantId: ctx.tenant.tenantId,
    actor: actorFromContext(ctx),
    subject: { entityType: "case", entityId: caseId },
    caseId,
    before: { state: existing.state },
    after: { state: row.state, note: args.note ?? null },
  });

  return row;
}
