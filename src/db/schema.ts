/**
 * Database schema — Drizzle ORM.
 *
 * This is the first-cut schema covering Cards 0-3 of the build playbook:
 *   - Tenant + TenantConfig (Card 2)
 *   - WorkforcePerson (Card 2; bare-minimum identity bits)
 *   - Candidate (Card 6)
 *   - RoleProfile (Card 3, versioned by append)
 *   - Case (Card 7)
 *   - AuditEvent (Card 1; the load-bearing table)
 *
 * Tables added in their own cards: ConsentRecord, Undertaking, EvidenceItem,
 * SuitabilityAssessment, SuitabilityInterview, AdverseIndicator, Decision,
 * RightOfReply, Adjudication, Appeal, HITLTask, AuditBundle, RescreeningTrigger,
 * Attestation.
 *
 * Conventions:
 *   - Primary keys are ULIDs (string-typed) for chronological sortability and
 *     tenant-scoped uniqueness.
 *   - Every tenant-scoped table carries `tenant_id`.
 *   - Timestamps in ISO 8601 UTC via `timestamp` mode "string".
 *   - JSONB for flexible payloads (rationale objects, scoring rubrics, etc.).
 *   - `audit_events` is enforced append-only via a Postgres trigger — see
 *     migrations for the trigger DDL.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// -----------------------------------------------------------------------------
// Enums
// -----------------------------------------------------------------------------

export const riskTierEnum = pgEnum("risk_tier", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const roleProfileStatusEnum = pgEnum("role_profile_status", [
  "draft",
  "pending_sign_off",
  "active",
  "retired",
]);

export const caseStateEnum = pgEnum("case_state", [
  "draft",
  "consent_pending",
  "evidence_gathering",
  "evidence_held",
  "synthesis",
  "decision_drafting",
  "right_of_reply",
  "adjudication_pending",
  "appeal",
  "closed_suitable",
  "closed_unsuitable",
  "closed_conditional",
  "closed_withdrawn",
]);

export const caseTypeEnum = pgEnum("case_type", ["initial", "rescreening"]);

export const workforcePersonTypeEnum = pgEnum("workforce_person_type", [
  "employee",
  "contractor",
  "volunteer",
  "third_party",
]);

export const workforcePersonStatusEnum = pgEnum("workforce_person_status", [
  "active",
  "suspended",
  "separated",
]);

// -----------------------------------------------------------------------------
// Tenant + Tenant Config
// -----------------------------------------------------------------------------

export const tenants = pgTable(
  "tenants",
  {
    tenantId: text("tenant_id").primaryKey(),
    clerkOrgId: text("clerk_org_id").notNull().unique(),
    name: text("name").notNull(),
    jurisdictions: jsonb("jurisdictions").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("tenants_clerk_org_idx").on(t.clerkOrgId)],
);

export const tenantConfigs = pgTable(
  "tenant_configs",
  {
    tenantConfigId: text("tenant_config_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    riskAppetite: text("risk_appetite").notNull(), // "low" | "medium" | "high"
    checkCatalogue: jsonb("check_catalogue").$type<unknown[]>().notNull(),
    tierToCheckSet: jsonb("tier_to_check_set").$type<Record<string, string[]>>().notNull(),
    revalidationCadences: jsonb("revalidation_cadences").$type<Record<string, string>>().notNull(),
    escalationThresholds: jsonb("escalation_thresholds").$type<Record<string, unknown>>().notNull(),
    suitabilityRubricRef: text("suitability_rubric_ref"),
    retentionClasses: jsonb("retention_classes").$type<unknown[]>().notNull(),
    highTierThreshold: riskTierEnum("high_tier_threshold").notNull().default("high"),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("tenant_configs_tenant_version_idx").on(t.tenantId, t.version),
    index("tenant_configs_active_idx").on(t.tenantId, t.isActive),
  ],
);

// -----------------------------------------------------------------------------
// Workforce Person (employees, contractors, assessors)
// -----------------------------------------------------------------------------

export const workforcePersons = pgTable(
  "workforce_persons",
  {
    personId: text("person_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "cascade" }),
    clerkUserId: text("clerk_user_id"),
    displayName: text("display_name").notNull(),
    primaryEmail: text("primary_email").notNull(),
    type: workforcePersonTypeEnum("type").notNull(),
    status: workforcePersonStatusEnum("status").notNull().default("active"),
    originalCaseId: text("original_case_id"),
    currentRoleId: text("current_role_id"),
    assessorProfile: jsonb("assessor_profile").$type<unknown>(),
    screeningCurrency: jsonb("screening_currency").$type<unknown>(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("workforce_persons_clerk_idx").on(t.clerkUserId),
    index("workforce_persons_tenant_idx").on(t.tenantId),
  ],
);

// -----------------------------------------------------------------------------
// Candidate
// -----------------------------------------------------------------------------

export const candidates = pgTable(
  "candidates",
  {
    candidateId: text("candidate_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    primaryEmail: text("primary_email").notNull(),
    primaryPhone: text("primary_phone"),
    verifiedIdentityRef: text("verified_identity_ref"),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("candidates_tenant_idx").on(t.tenantId)],
);

// -----------------------------------------------------------------------------
// Role Profile — versioned by append
// -----------------------------------------------------------------------------

export const roleProfiles = pgTable(
  "role_profiles",
  {
    roleProfileId: text("role_profile_id").primaryKey(),
    roleId: text("role_id").notNull(), // logical role; many versions share this
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    assets: jsonb("assets").$type<unknown[]>().notNull().default([]),
    riskAssessment: jsonb("risk_assessment").$type<unknown>().notNull(),
    computedTier: riskTierEnum("computed_tier").notNull(),
    requiredCheckSet: jsonb("required_check_set").$type<string[]>().notNull(),
    revalidationCadence: text("revalidation_cadence").notNull(),
    pdInsertions: jsonb("pd_insertions").$type<unknown>().notNull(),
    status: roleProfileStatusEnum("status").notNull().default("draft"),
    preAdvertiseSignOff: jsonb("pre_advertise_sign_off").$type<unknown>(),
    createdByAgent: jsonb("created_by_agent").$type<unknown>(),
    createdAt: timestamp("created_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("role_profiles_role_version_idx").on(t.roleId, t.version),
    index("role_profiles_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

// -----------------------------------------------------------------------------
// Case — the central screening case
// -----------------------------------------------------------------------------

export const cases = pgTable(
  "cases",
  {
    caseId: text("case_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.candidateId),
    roleProfileId: text("role_profile_id")
      .notNull()
      .references(() => roleProfiles.roleProfileId),
    roleProfileVersion: integer("role_profile_version").notNull(),
    type: caseTypeEnum("type").notNull().default("initial"),
    scope: jsonb("scope").$type<string[]>().notNull().default([]),
    parentCaseId: text("parent_case_id"),
    state: caseStateEnum("state").notNull().default("draft"),
    consentRecordId: text("consent_record_id"),
    suitabilityAssessmentId: text("suitability_assessment_id"),
    decisionId: text("decision_id"),
    auditBundleId: text("audit_bundle_id"),
    openedAt: timestamp("opened_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
    closedAt: timestamp("closed_at", { mode: "string", withTimezone: true }),
  },
  (t) => [
    index("cases_tenant_state_idx").on(t.tenantId, t.state),
    index("cases_candidate_idx").on(t.candidateId),
  ],
);

// -----------------------------------------------------------------------------
// Audit Event — append-only, hash-chained
// -----------------------------------------------------------------------------
//
// IMPORTANT: this table is enforced append-only via a Postgres trigger created
// in a migration. See migrations/0000_audit_immutability.sql.
//
// Columns:
//   - event_id      : ULID; monotonic per tenant for chain ordering
//   - tenant_id     : isolates chains by tenant
//   - type          : AuditEventType enum (see src/lib/schemas.ts)
//   - actor         : { kind: "person" | "agent", ... }
//   - subject       : { entityType, entityId }
//   - case_id       : optional pointer to a Case
//   - before/after  : JSON snapshots for state-change events
//   - consent_ref   : the consent record valid at the time of the event
//   - lawful_basis  : the basis cited
//   - prev_hash     : sha256 hash of the previous event in this tenant's chain
//   - hash          : sha256 hash of this event's canonical content + prev_hash
//   - occurred_at   : the event timestamp
//   - recorded_at   : when the event was persisted
//
export const auditEvents = pgTable(
  "audit_events",
  {
    eventId: text("event_id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.tenantId, { onDelete: "restrict" }),
    type: text("type").notNull(),
    actor: jsonb("actor").$type<unknown>().notNull(),
    subject: jsonb("subject").$type<{ entityType: string; entityId: string }>().notNull(),
    caseId: text("case_id"),
    before: jsonb("before").$type<unknown>(),
    after: jsonb("after").$type<unknown>(),
    consentRefAtTime: text("consent_ref_at_time"),
    lawfulBasis: text("lawful_basis"),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    occurredAt: timestamp("occurred_at", { mode: "string", withTimezone: true }).notNull(),
    recordedAt: timestamp("recorded_at", { mode: "string", withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_tenant_recorded_idx").on(t.tenantId, t.recordedAt),
    index("audit_events_case_idx").on(t.caseId),
    index("audit_events_subject_idx").on(t.subject),
    uniqueIndex("audit_events_hash_unique").on(t.tenantId, t.hash),
  ],
);

// -----------------------------------------------------------------------------
// Type exports (Drizzle-inferred)
// -----------------------------------------------------------------------------

export type Tenant = typeof tenants.$inferSelect;
export type TenantInsert = typeof tenants.$inferInsert;

export type TenantConfig = typeof tenantConfigs.$inferSelect;
export type TenantConfigInsert = typeof tenantConfigs.$inferInsert;

export type WorkforcePerson = typeof workforcePersons.$inferSelect;
export type WorkforcePersonInsert = typeof workforcePersons.$inferInsert;

export type Candidate = typeof candidates.$inferSelect;
export type CandidateInsert = typeof candidates.$inferInsert;

export type RoleProfile = typeof roleProfiles.$inferSelect;
export type RoleProfileInsert = typeof roleProfiles.$inferInsert;

export type Case = typeof cases.$inferSelect;
export type CaseInsert = typeof cases.$inferInsert;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type AuditEventInsert = typeof auditEvents.$inferInsert;
