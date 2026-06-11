/**
 * Role Risk Agent (RR).
 *
 * Given a role title + description + accessible assets, produces:
 *   - Computed risk tier (low/medium/high/critical)
 *   - Structured risk assessment with rationale
 *   - Required check set for the tier
 *   - Revalidation cadence
 *   - PD insertion clauses (screening, ongoing obligations, confidentiality, COI)
 *   - Confidence + explainability artefact
 *
 * Uses Claude Sonnet via the Anthropic SDK with structured-output (JSON) mode.
 * Output is Zod-validated; failure → one retry with stricter prompt → throw.
 *
 * Audit events emitted:
 *   - agent.invocation (start + completion)
 *   - agent.explainability_emitted
 *   - role.risk.assessed (when persisted to a draft)
 */

import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { ulid } from "ulid";
import { z } from "zod";

import { recordEvent } from "@/lib/audit";
import {
  roleRiskAgentInputSchema,
  roleRiskAgentOutputSchema,
  type RoleRiskAgentOutput,
} from "@/lib/schemas";

const AGENT_CODE = "RR" as const;
const AGENT_VERSION = "0.1.0";
const MODEL = "claude-sonnet-4-6"; // upgrade once 4.7 is stable

const SYSTEM_PROMPT = `You are the Role Risk Agent in the True Vector workforce-vetting platform.

Your job is to assess a single role's risk and produce a structured risk profile that drives the vetting check set, the revalidation cadence, and the Position Description clauses that protect the employer and the candidate.

You produce JSON conforming to the schema in the user message. Be precise, defensible, and write in plain English suitable for a Security Officer at a defence-industry employer to review.

Conventions:
- Tier scale: low / medium / high / critical.
- Required checks come from this catalogue:
    identity, right_to_work, address_history_5y, qualifications, employment_history_5y,
    references_2_supervisors, national_police_check, conflict_of_interest, outside_interests,
    suitability_interview_basic, suitability_interview_role_specific,
    public_footprint_check, financial_probity, digital_footprint_extended.
- For roles with classified-information access (PROTECTED+) or weapons/critical-infrastructure assets, computed tier is at minimum HIGH regardless of other inputs.
- Always include public_footprint_check at MEDIUM and above.
- Always include identity + right_to_work + address_history_5y at every tier.
- Revalidation cadence is ISO 8601 (P1Y = annual, P6M = six-monthly, P3M = quarterly).
- Rationale: at least 50 characters, written in second person to the reviewing officer, explaining WHY this tier.
- Explainability narrative: at least 80 characters, listing what you weighed and why.
- Confidence: 0.0-1.0, calibrated to genuine uncertainty (lower for ambiguous role descriptions).

Output only the JSON object. No prose before or after.`;

function userPrompt(input: z.infer<typeof roleRiskAgentInputSchema>): string {
  return `Assess this role.

TITLE: ${input.title}

DESCRIPTION:
${input.description}

ACCESSIBLE ASSETS (${input.assets.length}):
${input.assets
  .map(
    (a, i) =>
      `  ${i + 1}. ${a.assetType} · value=${a.value} · criticality=${a.criticality}${a.notes ? ` · ${a.notes}` : ""}`,
  )
  .join("\n") || "  (none specified)"}

Produce JSON in this exact shape:

{
  "computedTier": "low" | "medium" | "high" | "critical",
  "riskAssessment": {
    "accessLevel": "ordinary" | "privileged" | "administrator" | "executive" | "unsupervised" | "remote" | "physical",
    "frequency": "rare" | "occasional" | "regular" | "constant",
    "duration": "short" | "fixed-term" | "ongoing",
    "impactScores": {
      "financial": 1-5, "reputation": 1-5, "clientHarm": 1-5,
      "productQuality": 1-5, "competitiveness": 1-5
    },
    "rationale": "string ≥ 50 chars"
  },
  "requiredCheckSet": ["string", ...],
  "revalidationCadence": "P{n}Y" | "P{n}M",
  "pdInsertions": {
    "screeningClause": "string (Position Description text)",
    "ongoingObligationsClause": "string",
    "confidentialityClause": "string",
    "coiClause": "string"
  },
  "confidence": 0.0-1.0,
  "explainability": {
    "considered": ["string", ...],
    "weights": { "name": number, ... },
    "narrative": "string ≥ 80 chars"
  }
}`;
}

export interface RunRoleRiskAgentArgs {
  tenantId: string;
  input: z.infer<typeof roleRiskAgentInputSchema>;
}

export interface RoleRiskAgentResult {
  output: RoleRiskAgentOutput;
  runId: string;
  agentRef: { agentCode: typeof AGENT_CODE; agentVersion: string; runId: string };
}

/**
 * Run the agent end-to-end. Returns the parsed, validated output plus
 * provenance the caller can attach to the resulting draft.
 *
 * Throws if the agent fails twice (initial + retry). The caller can catch
 * this and offer the officer a "score the role manually" fallback.
 */
export async function runRoleRiskAgent(
  args: RunRoleRiskAgentArgs,
): Promise<RoleRiskAgentResult> {
  const parsedInput = roleRiskAgentInputSchema.parse(args.input);
  const runId = `run_${ulid()}`;

  await recordEvent({
    type: "agent.invocation",
    tenantId: args.tenantId,
    actor: { kind: "agent", agentCode: AGENT_CODE, agentVersion: AGENT_VERSION, runId },
    subject: { entityType: "role_risk_run", entityId: runId },
    after: {
      phase: "start",
      input: { title: parsedInput.title, assetCount: parsedInput.assets.length },
    },
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  const client = new Anthropic({ apiKey });

  const output = await callWithRetry(client, parsedInput);

  await recordEvent({
    type: "agent.explainability_emitted",
    tenantId: args.tenantId,
    actor: { kind: "agent", agentCode: AGENT_CODE, agentVersion: AGENT_VERSION, runId },
    subject: { entityType: "role_risk_run", entityId: runId },
    after: {
      confidence: output.confidence,
      narrative: output.explainability.narrative,
    },
  });

  await recordEvent({
    type: "agent.invocation",
    tenantId: args.tenantId,
    actor: { kind: "agent", agentCode: AGENT_CODE, agentVersion: AGENT_VERSION, runId },
    subject: { entityType: "role_risk_run", entityId: runId },
    after: {
      phase: "complete",
      computedTier: output.computedTier,
      checks: output.requiredCheckSet.length,
    },
  });

  return {
    output,
    runId,
    agentRef: { agentCode: AGENT_CODE, agentVersion: AGENT_VERSION, runId },
  };
}

async function callWithRetry(
  client: Anthropic,
  input: z.infer<typeof roleRiskAgentInputSchema>,
): Promise<RoleRiskAgentOutput> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callOnce(client, input, attempt > 0);
    } catch (err) {
      if (attempt === 1) throw err;
      // First failure: try again with a stricter framing
    }
  }
  // Unreachable but TypeScript needs it.
  throw new Error("unreachable");
}

async function callOnce(
  client: Anthropic,
  input: z.infer<typeof roleRiskAgentInputSchema>,
  isRetry: boolean,
): Promise<RoleRiskAgentOutput> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    temperature: 0.2,
    system: SYSTEM_PROMPT + (isRetry ? "\n\nIMPORTANT: previous response failed schema validation. Output ONLY the JSON object — no markdown, no prefix, no suffix." : ""),
    messages: [{ role: "user", content: userPrompt(input) }],
  });

  const text = message.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n");

  const json = extractJsonObject(text);
  return roleRiskAgentOutputSchema.parse(json);
}

/**
 * Extract the first complete JSON object from the model's text response.
 * Some models wrap output in ```json fences or include prose preamble even
 * when told not to; this is a small defensive parser.
 */
function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();

  // Try as-is
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through
  }

  // Try the first ```...``` block
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // Fall through
    }
  }

  // Try the first balanced { ... } region
  const start = trimmed.indexOf("{");
  if (start >= 0) {
    let depth = 0;
    for (let i = start; i < trimmed.length; i++) {
      if (trimmed[i] === "{") depth++;
      else if (trimmed[i] === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error("could not extract JSON object from agent response");
}
