/**
 * Audit log primitive.
 *
 * This module is the load-bearing piece of the codebase. It is the only
 * sanctioned way to write to `audit_events`. The table has database triggers
 * that block UPDATE / DELETE / TRUNCATE; this helper computes the chain hash
 * inside a serialisable transaction so that two concurrent inserts cannot
 * collide on the chain head.
 *
 * Audit events are tenant-scoped and per-tenant chained: each event's hash
 * incorporates the hash of the previous event in that tenant's chain plus a
 * canonical serialisation of the event's own content plus an HMAC over the
 * combination. Tamper detection is done by `verifyChain(tenantId)`.
 *
 * Design choices:
 *   - HMAC (not plain hash) so an attacker who can read the DB but not the
 *     secret cannot forge a valid chain after splicing rows.
 *   - SERIALIZABLE isolation level when inserting; on serialisation failure,
 *     the helper retries up to 3 times. Lock-free; correct under load.
 *   - The first event in a tenant's chain uses `GENESIS_PREV_HASH` as
 *     `prev_hash`. This is a publicly known sentinel.
 *
 * Conventions enforced here:
 *   - `type` must be one of the values in `auditEventTypeSchema`.
 *   - `subject.entityType` and `subject.entityId` are mandatory.
 *   - `occurredAt` defaults to `new Date()` if not provided; supply it
 *     explicitly when recording an event after the fact (e.g. external system
 *     reported a state change that happened earlier).
 */

import { createHmac } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { z } from "zod";

import { db, type Db } from "@/db";
import { auditEvents, type AuditEvent } from "@/db/schema";

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

/**
 * The canonical audit event types. Mirrors domain_model_v0.1.md §5.
 * Extend this when introducing a new event type; do not use ad-hoc strings.
 */
export const auditEventTypeSchema = z.enum([
  // Role lifecycle
  "role.risk.assessed",
  "role.risk.signed_off",
  "role.risk.declined",
  "role.profile.activated",
  "role.profile.retired",
  // Case lifecycle
  "case.opened",
  "case.state.changed",
  "case.closed",
  "case.withdrawn",
  "case.reopened",
  // Consent / privacy
  "consent.captured",
  "consent.withdrawn",
  "consent.corrected",
  "undertaking.signed",
  "personal_information.access_requested",
  "personal_information.corrected",
  // Evidence
  "evidence.collected",
  "evidence.verified",
  "evidence.discrepancy",
  "evidence.expired",
  "evidence.corrected",
  "external.integration_called",
  "external.integration_failed",
  // Suitability + decision
  "suitability.assessed",
  "suitability.interview.completed",
  "decision.drafted",
  "decision.right_of_reply_invoked",
  "decision.right_of_reply_received",
  "decision.right_of_reply_expired",
  "decision.adjudicated",
  "decision.rendered",
  "decision.appealed",
  "appeal.resolved",
  // HITL
  "hitl.task_created",
  "hitl.task_claimed",
  "hitl.task_resolved",
  "hitl.task_timed_out",
  "hitl.task_escalated",
  // Lifecycle / rescreening
  "rescreening.triggered",
  "rescreening.opened",
  "rescreening.access_adjusted",
  "attestation.due",
  "attestation.completed",
  "attestation.overdue",
  // Audit + records
  "bundle.packaged",
  "bundle.accessed",
  "record.disposed",
  "audit.chain_incomplete",
  // Governance / quality
  "assessor.training_currency.updated",
  "assessor.coi_declared",
  "qa.review_sampled",
  "qa.review_completed",
  "programme.review_completed",
  // Agent-governance
  "agent.invocation",
  "agent.escalation",
  "agent.explainability_emitted",
]);

export type AuditEventType = z.infer<typeof auditEventTypeSchema>;

export const personActorSchema = z.object({
  kind: z.literal("person"),
  userId: z.string(),
  displayName: z.string().optional(),
  role: z.string().optional(),
});

export const agentActorSchema = z.object({
  kind: z.literal("agent"),
  agentCode: z.enum(["RR", "CP", "ID", "CR", "IN", "SU", "DC", "AU"]),
  agentVersion: z.string(),
  runId: z.string().optional(),
});

export const systemActorSchema = z.object({
  kind: z.literal("system"),
  service: z.string(),
});

export const actorSchema = z.discriminatedUnion("kind", [
  personActorSchema,
  agentActorSchema,
  systemActorSchema,
]);

export type Actor = z.infer<typeof actorSchema>;

export const subjectSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
});

export type Subject = z.infer<typeof subjectSchema>;

export const recordEventInputSchema = z.object({
  type: auditEventTypeSchema,
  tenantId: z.string(),
  actor: actorSchema,
  subject: subjectSchema,
  caseId: z.string().optional(),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
  consentRefAtTime: z.string().optional(),
  lawfulBasis: z.string().optional(),
  occurredAt: z.date().optional(),
});

export type RecordEventInput = z.infer<typeof recordEventInputSchema>;

// -----------------------------------------------------------------------------
// Hashing
// -----------------------------------------------------------------------------

/** Sentinel `prev_hash` value for the first event in any tenant's chain. */
export const GENESIS_PREV_HASH = "GENESIS";

function hmacSecret(): string {
  const secret = process.env.AUDIT_HMAC_SECRET;
  if (!secret) {
    throw new Error("AUDIT_HMAC_SECRET is required to compute audit chain hashes");
  }
  return secret;
}

/**
 * Deterministically serialise an event for hashing. The serialisation:
 *   - Sorts JSON object keys at every depth.
 *   - Uses ISO 8601 strings for timestamps.
 *   - Includes every field that's part of the audit semantics.
 *
 * Changing this function in any way breaks chain verification for existing
 * events. Treat it like a protocol version; if you must change it, introduce
 * an explicit chain-version field and migrate.
 */
function canonicalSerialise(event: {
  eventId: string;
  tenantId: string;
  type: string;
  actor: unknown;
  subject: { entityType: string; entityId: string };
  caseId?: string | undefined;
  before?: unknown;
  after?: unknown;
  consentRefAtTime?: string | undefined;
  lawfulBasis?: string | undefined;
  occurredAt: string;
  prevHash: string;
}): string {
  return JSON.stringify(event, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
}

function computeHash(canonical: string): string {
  return createHmac("sha256", hmacSecret()).update(canonical).digest("hex");
}

// -----------------------------------------------------------------------------
// recordEvent
// -----------------------------------------------------------------------------

const MAX_RETRIES = 3;

/**
 * Append an event to the audit log for a tenant. Computes the chain hash
 * inside a serialisable transaction so that the head of the chain is read and
 * extended atomically; on serialisation failure, retries up to MAX_RETRIES.
 *
 * Returns the persisted event. Throws on input validation errors and on
 * unrecoverable transaction failures.
 */
export async function recordEvent(input: RecordEventInput): Promise<AuditEvent> {
  const parsed = recordEventInputSchema.parse(input);

  const eventId = ulid();
  const occurredAt = (parsed.occurredAt ?? new Date()).toISOString();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const inserted = await db.transaction(
        async (tx) => {
          // SERIALIZABLE so concurrent appenders cannot both observe the same
          // chain head and both extend it.
          await tx.execute(sql`set transaction isolation level serializable`);

          const prevRow = await tx
            .select({ hash: auditEvents.hash })
            .from(auditEvents)
            .where(eq(auditEvents.tenantId, parsed.tenantId))
            .orderBy(sql`${auditEvents.recordedAt} desc, ${auditEvents.eventId} desc`)
            .limit(1);

          const prevHash = prevRow[0]?.hash ?? GENESIS_PREV_HASH;

          const canonical = canonicalSerialise({
            eventId,
            tenantId: parsed.tenantId,
            type: parsed.type,
            actor: parsed.actor,
            subject: parsed.subject,
            caseId: parsed.caseId,
            before: parsed.before,
            after: parsed.after,
            consentRefAtTime: parsed.consentRefAtTime,
            lawfulBasis: parsed.lawfulBasis,
            occurredAt,
            prevHash,
          });

          const hash = computeHash(canonical);

          const result = await tx
            .insert(auditEvents)
            .values({
              eventId,
              tenantId: parsed.tenantId,
              type: parsed.type,
              actor: parsed.actor,
              subject: parsed.subject,
              caseId: parsed.caseId,
              before: parsed.before,
              after: parsed.after,
              consentRefAtTime: parsed.consentRefAtTime,
              lawfulBasis: parsed.lawfulBasis,
              prevHash,
              hash,
              occurredAt,
            })
            .returning();

          if (!result[0]) {
            throw new Error("audit event insert returned no rows");
          }
          return result[0];
        },
        { isolationLevel: "serializable" },
      );

      return inserted;
    } catch (err) {
      if (isSerializationFailure(err) && attempt < MAX_RETRIES - 1) {
        // Brief backoff before retry.
        await sleep(10 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }

  // Unreachable: the loop either returns or throws.
  throw new Error("recordEvent exhausted retries");
}

function isSerializationFailure(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: string }).code;
  // 40001 = serialization_failure; 40P01 = deadlock_detected.
  return code === "40001" || code === "40P01";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -----------------------------------------------------------------------------
// Verification
// -----------------------------------------------------------------------------

export interface ChainVerificationResult {
  valid: boolean;
  events: number;
  firstBrokenEventId: string | null;
  reason: string | null;
}

/**
 * Walk a tenant's audit chain in order and verify every link. Recomputes the
 * canonical serialisation and HMAC for each event and confirms that:
 *   - The first event's prev_hash equals GENESIS_PREV_HASH.
 *   - Each subsequent event's prev_hash equals the previous event's hash.
 *   - Each event's stored hash matches its recomputed hash.
 *
 * This is the function an audit run will call. It detects:
 *   - Inserted rows that bypass the helper (hash will be invalid).
 *   - Modified rows (recomputed hash won't match stored).
 *   - Deleted middle rows (the chain will be broken at the gap).
 *
 * For very large chains, walk in batches; for prototype scale (thousands of
 * events) the simple one-shot walk is sufficient.
 */
export async function verifyChain(
  tenantId: string,
  client: Db = db,
): Promise<ChainVerificationResult> {
  const rows = await client
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.tenantId, tenantId))
    .orderBy(sql`${auditEvents.recordedAt} asc, ${auditEvents.eventId} asc`);

  let expectedPrev = GENESIS_PREV_HASH;

  for (const row of rows) {
    if (row.prevHash !== expectedPrev) {
      return {
        valid: false,
        events: rows.length,
        firstBrokenEventId: row.eventId,
        reason: `prev_hash mismatch (expected ${expectedPrev}, got ${row.prevHash})`,
      };
    }

    const canonical = canonicalSerialise({
      eventId: row.eventId,
      tenantId: row.tenantId,
      type: row.type,
      actor: row.actor,
      subject: row.subject,
      caseId: row.caseId ?? undefined,
      before: row.before,
      after: row.after,
      consentRefAtTime: row.consentRefAtTime ?? undefined,
      lawfulBasis: row.lawfulBasis ?? undefined,
      occurredAt: row.occurredAt,
      prevHash: row.prevHash,
    });

    const recomputed = computeHash(canonical);
    if (recomputed !== row.hash) {
      return {
        valid: false,
        events: rows.length,
        firstBrokenEventId: row.eventId,
        reason: "stored hash does not match recomputed canonical hash",
      };
    }

    expectedPrev = row.hash;
  }

  return { valid: true, events: rows.length, firstBrokenEventId: null, reason: null };
}

/**
 * Read the audit chain for a single case in chronological order. Useful for
 * dashboards and the Audit Bundle inspector.
 */
export async function eventChainForCase(caseId: string): Promise<AuditEvent[]> {
  return db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.caseId, caseId))
    .orderBy(sql`${auditEvents.recordedAt} asc, ${auditEvents.eventId} asc`);
}
