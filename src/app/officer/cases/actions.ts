"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { openCase } from "@/lib/case";
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
