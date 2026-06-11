/**
 * Zod schemas — single source of truth for runtime validation AND TS types.
 *
 * Convention: define the schema, then `export type X = z.infer<typeof xSchema>`.
 * Anywhere we receive untrusted input (form submissions, agent outputs,
 * webhook payloads), we parse through one of these.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Risk tier and access taxonomy
// ---------------------------------------------------------------------------

export const riskTierSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskTier = z.infer<typeof riskTierSchema>;

export const accessLevelSchema = z.enum([
  "ordinary",
  "privileged",
  "administrator",
  "executive",
  "unsupervised",
  "remote",
  "physical",
]);

export const frequencySchema = z.enum([
  "rare",
  "occasional",
  "regular",
  "constant",
]);

export const durationSchema = z.enum(["short", "fixed-term", "ongoing"]);

export const assetTypeSchema = z.enum([
  "people",
  "system",
  "facility",
  "sensitive-information",
  "infrastructure",
  "weapon",
  "funds",
  "ip",
]);

export const assetAccessSchema = z.object({
  assetType: assetTypeSchema,
  assetRef: z.string().optional(),
  value: z.number().int().min(1).max(5),
  criticality: z.number().int().min(1).max(5),
  notes: z.string().optional(),
});
export type AssetAccess = z.infer<typeof assetAccessSchema>;

// ---------------------------------------------------------------------------
// Role Profile shape
// ---------------------------------------------------------------------------

export const impactScoresSchema = z.object({
  financial: z.number().int().min(1).max(5),
  reputation: z.number().int().min(1).max(5),
  clientHarm: z.number().int().min(1).max(5),
  productQuality: z.number().int().min(1).max(5),
  competitiveness: z.number().int().min(1).max(5),
});
export type ImpactScores = z.infer<typeof impactScoresSchema>;

export const riskAssessmentSchema = z.object({
  accessLevel: accessLevelSchema,
  frequency: frequencySchema,
  duration: durationSchema.default("ongoing"),
  impactScores: impactScoresSchema,
  rationale: z.string().min(50),
});
export type RiskAssessment = z.infer<typeof riskAssessmentSchema>;

export const pdInsertionsSchema = z.object({
  screeningClause: z.string(),
  ongoingObligationsClause: z.string(),
  confidentialityClause: z.string(),
  coiClause: z.string(),
});
export type PDInsertions = z.infer<typeof pdInsertionsSchema>;

export const createRoleProfileDraftSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(20),
  assets: z.array(assetAccessSchema).min(0).max(20),
  riskAssessment: riskAssessmentSchema.optional(), // populated by RR or by officer manually
});
export type CreateRoleProfileDraftInput = z.infer<typeof createRoleProfileDraftSchema>;

// ---------------------------------------------------------------------------
// Role Risk Agent — input and output
// ---------------------------------------------------------------------------

export const roleRiskAgentInputSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(20),
  assets: z.array(assetAccessSchema).min(0).max(20),
});

export const roleRiskAgentOutputSchema = z.object({
  computedTier: riskTierSchema,
  riskAssessment: riskAssessmentSchema,
  requiredCheckSet: z.array(z.string()).min(1),
  revalidationCadence: z
    .string()
    .regex(/^P\d+[YMD]$/, "ISO 8601 period (e.g. P1Y)"),
  pdInsertions: pdInsertionsSchema,
  confidence: z.number().min(0).max(1),
  explainability: z.object({
    considered: z.array(z.string()),
    weights: z.record(z.string(), z.number()),
    narrative: z.string().min(80),
  }),
});
export type RoleRiskAgentOutput = z.infer<typeof roleRiskAgentOutputSchema>;
