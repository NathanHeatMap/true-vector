"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { advanceCaseState, openCase } from "@/lib/case";
import { requireRole } from "@/lib/tenant";

const openCaseSchema = z.object({
  candidateId: z.string().min(1),
  roleProfileId: z.string().min(1),
});

export type OpenCaseActionInput = z.infer<typeof openCaseSchema>;

export interface OpenCaseActionResult {
  ok: boolean;
  caseId?: string;
  error?: string;
}

export async function openCaseAction(
  rawInput: OpenCaseActionInput,
): Promise<OpenCaseActionResult> {
  const ctx = await requireRole(["officer", "owner", "hr"]);

  const parsed = openCaseSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    const c = await openCase({
      ctx,
      input: {
        candidateId: parsed.data.candidateId,
        roleProfileId: parsed.data.roleProfileId,
      },
    });
    revalidatePath("/officer/cases");
    revalidatePath("/officer");
    revalidatePath(`/officer/candidates/${parsed.data.candidateId}`);
    return { ok: true, caseId: c.caseId };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to open case",
    };
  }
}


const advanceCaseSchema = z.object({
  caseId: z.string().min(1),
  toState: z.enum([
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
  ]),
  note: z.string().max(500).optional(),
});

export type AdvanceCaseActionInput = z.infer<typeof advanceCaseSchema>;

export interface AdvanceCaseActionResult {
  ok: boolean;
  error?: string;
}

export async function advanceCaseStateAction(
  rawInput: AdvanceCaseActionInput,
): Promise<AdvanceCaseActionResult> {
  const ctx = await requireRole(["officer", "owner", "adjudicator"]);
  const parsed = advanceCaseSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  try {
    await advanceCaseState({
      ctx,
      caseId: parsed.data.caseId,
      toState: parsed.data.toState,
      note: parsed.data.note,
    });
    revalidatePath("/officer/cases");
    revalidatePath(`/officer/cases/${parsed.data.caseId}`);
    revalidatePath("/officer");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not advance state",
    };
  }
}
