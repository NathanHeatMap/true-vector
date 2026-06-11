/**
 * Tenant + IAM helpers.
 *
 * Every server action and route handler MUST start with `requireRole(...)`.
 * This is the single seam where:
 *   - Auth is enforced (Clerk session present)
 *   - Tenant context is resolved (Clerk org → our Tenant row)
 *   - Role is checked
 *   - Person is resolved or auto-provisioned
 *
 * Returns the Tenant + the calling WorkforcePerson + their role on this tenant.
 * Anything downstream uses this context, never reads Clerk's auth directly.
 *
 * CONVENTIONS:
 *   - Cross-tenant reads return EMPTY arrays / NULL — never throw with detail.
 *     This prevents enumeration of other tenants' identifiers.
 *   - Every access to a sensitive field goes through `redactSensitive()` which
 *     reads the caller's role to decide what to strip.
 *   - First mention of `requireRole(['officer'])` in a server action / route
 *     is the audit trail's "actor" for the rest of that request.
 */

import "server-only";

import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import { db } from "@/db";
import { tenants, workforcePersons, type Tenant, type WorkforcePerson } from "@/db/schema";

/**
 * The set of roles a workforce person can hold on a tenant.
 * Mirrors the personas in the design corpus.
 */
export type WorkforceRole =
  | "officer" // Security Officer — the primary user (Helen persona)
  | "adjudicator" // Decides on adverse outcomes
  | "analyst" // Verifies Public Footprint findings and similar HITL tasks
  | "owner" // Program Owner — signs off high-tier roles
  | "auditor" // Read-only access for audit reviews
  | "hr" // HR Generalist — limited operational access
  | "candidate"; // Subject of a vetting case — outside the dashboard

export interface RequestContext {
  tenant: Tenant;
  person: WorkforcePerson;
  /** Roles this person holds on this tenant. May be more than one. */
  roles: WorkforceRole[];
  /** Convenience flag for read-only auditor sessions. */
  isReadOnly: boolean;
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Require an authenticated session with one of the given roles.
 *
 * Returns the RequestContext that downstream code must use as the source of
 * truth for tenant + person identity. Throws ForbiddenError otherwise (which
 * the route handler turns into a 403 response — never leaks why).
 */
export async function requireRole(
  allowedRoles: WorkforceRole[],
): Promise<RequestContext> {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    throw new ForbiddenError();
  }

  let tenant = await getTenantByClerkOrgId(session.orgId);
  if (!tenant) {
    // Prototype: auto-provision the Tenant row on first sign-in. In production
    // this is done by the Clerk `organization.created` webhook, but for the
    // prototype we don't gate the experience on webhook configuration.
    tenant = await provisionTenantForClerkOrg({
      clerkOrgId: session.orgId,
      name: session.orgSlug ?? "New tenant",
    });
  }

  const person = await ensurePerson({
    clerkUserId: session.userId,
    tenantId: tenant.tenantId,
  });

  const roles = derivePersonRoles({
    clerkRole: session.orgRole,
    person,
  });

  const allowed = allowedRoles.some((r) => roles.includes(r));
  if (!allowed) {
    throw new ForbiddenError();
  }

  return {
    tenant,
    person,
    roles,
    isReadOnly: roles.length === 1 && roles[0] === "auditor",
  };
}

/**
 * Optional variant — returns null instead of throwing when the session is
 * unauthenticated or unauthorised. Useful for routes that render different
 * content per role rather than failing closed.
 */
export async function tryGetContext(
  allowedRoles?: WorkforceRole[],
): Promise<RequestContext | null> {
  try {
    return await requireRole(allowedRoles ?? ["officer", "adjudicator", "analyst", "owner", "auditor", "hr"]);
  } catch {
    return null;
  }
}

/**
 * Look up our Tenant row by Clerk organisation id.
 * Created via the Clerk webhook (organization.created); we never auto-create
 * here because we need explicit consent (and billing) before provisioning a tenant.
 */
export async function getTenantByClerkOrgId(
  clerkOrgId: string,
): Promise<Tenant | null> {
  const row = await db
    .select()
    .from(tenants)
    .where(eq(tenants.clerkOrgId, clerkOrgId))
    .limit(1);
  return row[0] ?? null;
}
/**
 * Auto-provision a Tenant row for a Clerk organisation that doesn't yet have
 * one. Idempotent — if a row already exists (race condition), returns it.
 * Production should fire this via the Clerk webhook; this fallback keeps the
 * prototype usable even before the webhook is wired up.
 */
async function provisionTenantForClerkOrg(args: {
  clerkOrgId: string;
  name: string;
}): Promise<Tenant> {
  const existing = await getTenantByClerkOrgId(args.clerkOrgId);
  if (existing) return existing;

  // Use ON CONFLICT DO NOTHING so two concurrent requests (layout + page render
  // in parallel) don't both attempt an INSERT and one fail with a unique
  // constraint violation. If the insert is a no-op due to conflict, re-fetch.
  const inserted = await db
    .insert(tenants)
    .values({
      tenantId: `tnt_${ulid()}`,
      clerkOrgId: args.clerkOrgId,
      name: args.name,
      jurisdictions: ["AU"],
    })
    .onConflictDoNothing({ target: tenants.clerkOrgId })
    .returning();

  if (inserted[0]) return inserted[0];

  const refetched = await getTenantByClerkOrgId(args.clerkOrgId);
  if (!refetched) {
    throw new Error("failed to provision tenant");
  }
  return refetched;
}


/**
 * Ensure a WorkforcePerson row exists for this Clerk user on this tenant.
 * Idempotent — safe to call on every request. The person record is the
 * actor we attach to audit events; without it, audit traceability breaks.
 */
async function ensurePerson(args: {
  clerkUserId: string;
  tenantId: string;
}): Promise<WorkforcePerson> {
  const existing = await db
    .select()
    .from(workforcePersons)
    .where(eq(workforcePersons.clerkUserId, args.clerkUserId))
    .limit(1);

  if (existing[0]) {
    return existing[0];
  }

  // Auto-provision a minimal record. The Clerk webhook will enrich with name,
  // email, etc. on the next session refresh — but we never want to block a
  // legitimate request waiting for the webhook.
  const inserted = await db
    .insert(workforcePersons)
    .values({
      personId: `wp_${ulid()}`,
      tenantId: args.tenantId,
      clerkUserId: args.clerkUserId,
      displayName: "Unknown",
      primaryEmail: "unknown@example.invalid",
      type: "employee",
      status: "active",
    })
    .returning();

  if (!inserted[0]) {
    throw new Error("failed to provision workforce person");
  }
  return inserted[0];
}

/**
 * Translate Clerk organisation role + our person metadata into the set of
 * workforce roles this caller holds on this tenant.
 *
 * Convention:
 *   - Clerk org:admin  → ["officer", "owner"]
 *   - Clerk org:basic  → ["officer"]
 *   - Per-tenant fine-grained roles (analyst, adjudicator, auditor, hr) are
 *     stored on the WorkforcePerson record (TBD field — for now this is a
 *     placeholder; Card 2.5 will add the role registry).
 */
function derivePersonRoles(args: {
  clerkRole: string | null | undefined;
  person: WorkforcePerson;
}): WorkforceRole[] {
  const roles: WorkforceRole[] = [];

  if (args.clerkRole === "org:admin") {
    roles.push("officer", "owner");
  } else if (args.clerkRole) {
    roles.push("officer");
  }

  // Future: read additional roles from assessorProfile / a roles table.
  // For now, the prototype assumes most users are Security Officers.

  if (roles.length === 0) {
    roles.push("officer");
  }
  return roles;
}

/**
 * Build the "actor" structure used by `recordEvent()` for audit logging.
 * Always derive from the RequestContext — never from the raw Clerk session.
 */
export function actorFromContext(ctx: RequestContext) {
  return {
    kind: "person" as const,
    userId: ctx.person.personId,
    displayName: ctx.person.displayName,
    role: ctx.roles[0],
  };
}
