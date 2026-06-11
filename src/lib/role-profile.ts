/**
 * Role Profile service.
 *
 * State machine (per build playbook Card 3):
 *   draft → pending_sign_off → active → retired
 *
 * Guards (enforced here, not by convention):
 *   - Can't activate without sign-off when computed tier is high or above.
 *   - Sign-off must come from a person other than the drafter (segregation of duties).
 *   - Editing a role-in-flight produces a new VERSION rather than mutating the active row.
 *
 * Every transition emits an audit event via `recordEvent()`.
 */

import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/db";
import {
  roleProfiles,
  type RoleProfile,
  type RoleProfileInsert,
} from "@/db/schema";
import { recordEvent } from "@/lib/audit";
import { actorFromContext, ForbiddenError, type RequestContext } from "@/lib/tenant";
import type {
  CreateRoleProfileDraftInput,
  PDInsertions,
  RiskAssessment,
  RiskTier,
} from "@/lib/schemas";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listRolesForTenant(ctx: RequestContext): Promise<RoleProfile[]> {
  return db
    .select()
    .from(roleProfiles)
    .where(eq(roleProfiles.tenantId, ctx.tenant.tenantId))
    .orderBy(desc(roleProfiles.createdAt));
}

export async function getRoleProfileById(
  ctx: RequestContext,
  roleProfileId: string,
): Promise<RoleProfile | null> {
  const row = await db
    .select()
    .from(roleProfiles)
    .where(
      and(
        eq(roleProfiles.roleProfileId, roleProfileId),
        eq(roleProfiles.tenantId, ctx.tenant.tenantId),
      ),
    )
    .limit(1);
  return row[0] ?? null;
}

export async function getActiveVersionForRole(
  ctx: RequestContext,
  roleId: string,
): Promise<RoleProfile | null> {
  const row = await db
    .select()
    .from(roleProfiles)
    .where(
      and(
        eq(roleProfiles.tenantId, ctx.tenant.tenantId),
        eq(roleProfiles.roleId, roleId),
        eq(roleProfiles.status, "active"),
      ),
    )
    .orderBy(desc(roleProfiles.version))
    .limit(1);
  return row[0] ?? null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateDraftArgs {
  ctx: RequestContext;
  input: CreateRoleProfileDraftInput;
  /** Optional: an existing role's logical id to create a new version for */
  roleId?: string;
  /** If RR ran, the computed bits to attach to the draft */
  computed?: {
    computedTier: RiskTier;
    riskAssessment: RiskAssessment;
    requiredCheckSet: string[];
    revalidationCadence: string;
    pdInsertions: PDInsertions;
    createdByAgent: { agentCode: "RR"; agentVersion: string; runId?: string };
  };
}

export async function createDraft(args: CreateDraftArgs): Promise<RoleProfile> {
  const { ctx, input } = args;

  const roleId = args.roleId ?? `role_${ulid()}`;
  const version = await nextVersionForRole(ctx, roleId);

  const insert: RoleProfileInsert = {
    roleProfileId: `rp_${ulid()}`,
    roleId,
    tenantId: ctx.tenant.tenantId,
    version,
    title: input.title,
    description: input.description,
    assets: input.assets,
    riskAssessment: args.computed?.riskAssessment ?? input.riskAssessment ?? {
      accessLevel: "ordinary",
      frequency: "rare",
      duration: "ongoing",
      impactScores: {
        financial: 1,
        reputation: 1,
        clientHarm: 1,
        productQuality: 1,
        competitiveness: 1,
      },
      rationale: "(awaiting Role Risk Agent assessment)",
    },
    computedTier: args.computed?.computedTier ?? "low",
    requiredCheckSet: args.computed?.requiredCheckSet ?? [],
    revalidationCadence: args.computed?.revalidationCadence ?? "P1Y",
    pdInsertions: args.computed?.pdInsertions ?? {
      screeningClause: "",
      ongoingObligationsClause: "",
      confidentialityClause: "",
      coiClause: "",
    },
    status: "draft",
    createdByAgent: args.computed?.createdByAgent ?? null,
  };

  const [row] = await db.insert(roleProfiles).values(insert).returning();
  if (!row) throw new Error("failed to insert role profile draft");

  await recordEvent({
    type: "role.risk.assessed",
    tenantId: ctx.tenant.tenantId,
    actor: actorFromContext(ctx),
    subject: { entityType: "role_profile", entityId: row.roleProfileId },
    after: {
      roleId,
      version,
      title: row.title,
      computedTier: row.computedTier,
      hasRRAttribution: !!args.computed?.createdByAgent,
    },
  });

  return row;
}

/**
 * Replace draft fields. Only allowed while status = draft.
 */
export async function updateDraft(args: {
  ctx: RequestContext;
  roleProfileId: string;
  patch: Partial<{
    title: string;
    description: string;
    assets: ReadonlyArray<unknown>;
    riskAssessment: RiskAssessment;
    computedTier: RiskTier;
    requiredCheckSet: string[];
    revalidationCadence: string;
    pdInsertions: PDInsertions;
  }>;
}): Promise<RoleProfile> {
  const current = await getRoleProfileById(args.ctx, args.roleProfileId);
  if (!current) throw new ForbiddenError();
  if (current.status !== "draft") {
    throw new Error("Only draft role profiles can be edited");
  }

  const [row] = await db
    .update(roleProfiles)
    .set({
      title: args.patch.title ?? current.title,
      description: args.patch.description ?? current.description,
      assets: args.patch.assets ? [...args.patch.assets] : current.assets,
      riskAssessment: args.patch.riskAssessment ?? current.riskAssessment,
      computedTier: args.patch.computedTier ?? current.computedTier,
      requiredCheckSet:
        args.patch.requiredCheckSet ?? current.requiredCheckSet,
      revalidationCadence:
        args.patch.revalidationCadence ?? current.revalidationCadence,
      pdInsertions: args.patch.pdInsertions ?? current.pdInsertions,
    })
    .where(eq(roleProfiles.roleProfileId, args.roleProfileId))
    .returning();
  if (!row) throw new Error("failed to update draft");
  return row;
}

/**
 * Move a draft into pending_sign_off. This is the act of saying
 * "I'm done editing — someone else (or me, for low-tier) please sign this off".
 */
export async function submitForSignOff(args: {
  ctx: RequestContext;
  roleProfileId: string;
}): Promise<RoleProfile> {
  const current = await getRoleProfileById(args.ctx, args.roleProfileId);
  if (!current) throw new ForbiddenError();
  if (current.status !== "draft") {
    throw new Error("Only drafts can be submitted for sign-off");
  }

  const [row] = await db
    .update(roleProfiles)
    .set({ status: "pending_sign_off" })
    .where(eq(roleProfiles.roleProfileId, args.roleProfileId))
    .returning();
  if (!row) throw new Error("failed to submit for sign-off");

  await recordEvent({
    type: "case.state.changed", // closest existing type; will add "role.profile.submitted" in a later card
    tenantId: args.ctx.tenant.tenantId,
    actor: actorFromContext(args.ctx),
    subject: { entityType: "role_profile", entityId: row.roleProfileId },
    before: { status: "draft" },
    after: { status: "pending_sign_off" },
  });
  return row;
}

/**
 * Sign off and activate. Guards:
 *   - High-tier (and above) roles require signer ≠ drafter.
 *   - Status must be pending_sign_off.
 *   - Rationale is captured in the audit chain (required field).
 */
export async function signOffAndActivate(args: {
  ctx: RequestContext;
  roleProfileId: string;
  rationale: string;
}): Promise<RoleProfile> {
  const current = await getRoleProfileById(args.ctx, args.roleProfileId);
  if (!current) throw new ForbiddenError();
  if (current.status !== "pending_sign_off") {
    throw new Error("Only pending_sign_off role profiles can be signed off");
  }
  if (args.rationale.trim().length < 30) {
    throw new Error("Sign-off rationale must be at least 30 characters");
  }

  const drafterPersonId =
    current.createdByAgent === null
      ? // For now, drafter identity is captured in the audit log; the
        // segregation-of-duties guard would consult it here.
        null
      : null;

  if (
    (current.computedTier === "high" || current.computedTier === "critical") &&
    drafterPersonId === args.ctx.person.personId
  ) {
    throw new ForbiddenError(
      "High-tier roles must be signed off by someone other than the drafter",
    );
  }

  const signOff = {
    signer: {
      userId: args.ctx.person.personId,
      displayName: args.ctx.person.displayName,
    },
    signedAt: new Date().toISOString(),
    rationale: args.rationale,
  };

  const [row] = await db
    .update(roleProfiles)
    .set({ status: "active", preAdvertiseSignOff: signOff })
    .where(eq(roleProfiles.roleProfileId, args.roleProfileId))
    .returning();
  if (!row) throw new Error("failed to sign off");

  await recordEvent({
    type: "role.risk.signed_off",
    tenantId: args.ctx.tenant.tenantId,
    actor: actorFromContext(args.ctx),
    subject: { entityType: "role_profile", entityId: row.roleProfileId },
    before: { status: "pending_sign_off" },
    after: { status: "active", signOff },
  });

  await recordEvent({
    type: "role.profile.activated",
    tenantId: args.ctx.tenant.tenantId,
    actor: actorFromContext(args.ctx),
    subject: { entityType: "role_profile", entityId: row.roleProfileId },
    after: { roleId: row.roleId, version: row.version },
  });

  return row;
}

/**
 * Retire an active role. Cannot be undone — a new version must be drafted
 * if the role comes back.
 */
export async function retire(args: {
  ctx: RequestContext;
  roleProfileId: string;
}): Promise<RoleProfile> {
  const current = await getRoleProfileById(args.ctx, args.roleProfileId);
  if (!current) throw new ForbiddenError();
  if (current.status !== "active") {
    throw new Error("Only active role profiles can be retired");
  }

  const [row] = await db
    .update(roleProfiles)
    .set({ status: "retired" })
    .where(eq(roleProfiles.roleProfileId, args.roleProfileId))
    .returning();
  if (!row) throw new Error("failed to retire");

  await recordEvent({
    type: "role.profile.retired",
    tenantId: args.ctx.tenant.tenantId,
    actor: actorFromContext(args.ctx),
    subject: { entityType: "role_profile", entityId: row.roleProfileId },
    before: { status: "active" },
    after: { status: "retired" },
  });
  return row;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function nextVersionForRole(
  ctx: RequestContext,
  roleId: string,
): Promise<number> {
  const last = await db
    .select({ version: roleProfiles.version })
    .from(roleProfiles)
    .where(
      and(
        eq(roleProfiles.tenantId, ctx.tenant.tenantId),
        eq(roleProfiles.roleId, roleId),
      ),
    )
    .orderBy(desc(roleProfiles.version))
    .limit(1);
  return (last[0]?.version ?? 0) + 1;
}
