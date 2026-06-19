"use server";

/**
 * Server actions for the candidates workflow.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createCandidate } from "@/lib/candidate";
import { requireRole } from "@/lib/tenant";

const createCandidateSchema = z.object({
  displayName: z.string().min(2, "Display name must be at least 2 characters").max(200),
  primaryEmail: z.string().email("Must be a valid email address"),
  primaryPhone: z.string().max(40).optional().or(z.literal("")),
});

export type CreateCandidateActionInput = z.infer<typeof createCandidateSchema>;

export interface CreateCandidateActionResult {
  ok: boolean;
  candidateId?: string;
  error?: string;
}

export async function createCandidateAction(
  rawInput: CreateCandidateActionInput,
): Promise<CreateCandidateActionResult> {
  const ctx = await requireRole(["officer", "owner", "hr"]);

  const parsed = createCandidateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const candidate = await createCandidate({
    ctx,
    input: {
      displayName: parsed.data.displayName,
      primaryEmail: parsed.data.primaryEmail,
      primaryPhone: parsed.data.primaryPhone || null,
    },
  });

  revalidatePath("/officer/candidates");
  revalidatePath("/officer");
  return { ok: true, candidateId: candidate.candidateId };
}
