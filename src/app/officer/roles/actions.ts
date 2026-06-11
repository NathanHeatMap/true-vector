"use server";

/**
 * Server actions for the roles workflow.
 *
 * Pattern: every action starts with `requireRole(...)`. Returns serialisable
 * data only (no DB rows with Date instances etc — strings/numbers/JSON).
 * Errors thrown here propagate as exceptions to the React error boundary;
 * known-good error paths return shaped result objects instead.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { runRoleRiskAgent } from "@/agents/role-risk";
import {
  createDraft,
  retire,
  signOffAndActivate,
  submitForSignOff,
} from "@/lib/role-profile";
import {
  assetAccessSchema,
  roleRiskAgentInputSchema,
} from "@/lib/schemas";
import { requireRole } from "@/lib/tenant";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Score + create
// ---------------------------------------------------------------------------

const scoreAndCreateSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(20),
  assets: z.array(assetAccessSchema).max(20),
});

export type ScoreAndCreateInput = z.infer<typeof scoreAndCreateSchema>;

export interface ScoreAndCreateResult {
  ok: boolean;
  roleProfileId?: string;
  error?: string;
}

/**
 * Score a draft role with the RR agent and persist the resulting draft.
 * Redirects to the draft's detail page on success.
 */
export async function scoreAndCreateRole(
  rawInput: ScoreAndCreateInput,
): Promise<ScoreAndCreateResult> {
  const ctx = await requireRole(["officer", "owner"]);
  const input = scoreAndCreateSchema.parse(rawInput);

  // Run the agent. This is where the value comes from — RR produces the
  // computed tier, check set, PD insertions, etc. Officer reviews afterward.
  let agentResult;
  try {
    agentResult = await runRoleRiskAgent({
      tenantId: ctx.tenant.tenantId,
      input: roleRiskAgentInputSchema.parse(input),
    });
  } catch (err) {
    console.error("RR agent failed", err);
    return {
      ok: false,
      error:
        "The Role Risk Agent could not produce a valid assessment. You can still create a manual draft and score it yourself.",
    };
  }

  const draft = await createDraft({
    ctx,
    input,
    computed: {
      computedTier: agentResult.output.computedTier,
      riskAssessment: agentResult.output.riskAssessment,
      requiredCheckSet: agentResult.output.requiredCheckSet,
      revalidationCadence: agentResult.output.revalidationCadence,
      pdInsertions: agentResult.output.pdInsertions,
      createdByAgent: agentResult.agentRef,
    },
  });

  revalidatePath("/officer");
  revalidatePath("/officer/roles");
  return { ok: true, roleProfileId: draft.roleProfileId };
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export async function submitDraftForSignOff(roleProfileId: string) {
  const ctx = await requireRole(["officer", "owner"]);
  await submitForSignOff({ ctx, roleProfileId });
  revalidatePath("/officer/roles");
  revalidatePath(`/officer/roles/${roleProfileId}`);
}

const signOffSchema = z.object({
  roleProfileId: z.string(),
  rationale: z.string().min(30, "Rationale must be at least 30 characters"),
});

export async function signOffRole(
  input: z.infer<typeof signOffSchema>,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requireRole(["officer", "owner"]);
  const parsed = signOffSchema.parse(input);
  try {
    await signOffAndActivate({
      ctx,
      roleProfileId: parsed.roleProfileId,
      rationale: parsed.rationale,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/officer");
  revalidatePath("/officer/roles");
  revalidatePath(`/officer/roles/${parsed.roleProfileId}`);
  return { ok: true };
}

export async function retireRole(roleProfileId: string) {
  const ctx = await requireRole(["officer", "owner"]);
  await retire({ ctx, roleProfileId });
  revalidatePath("/officer/roles");
  revalidatePath(`/officer/roles/${roleProfileId}`);
  redirect("/officer/roles");
}
