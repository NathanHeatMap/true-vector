import { Badge } from "@/components/ui/badge";

/**
 * StatePill — maps internal Case / RoleProfile state names to plain-English
 * labels and consistent colours, per UX safeguards §5.
 *
 * NEVER show raw enum values in the UI. Always go through this component.
 */

type CaseState =
  | "draft"
  | "consent_pending"
  | "evidence_gathering"
  | "evidence_held"
  | "synthesis"
  | "decision_drafting"
  | "right_of_reply"
  | "adjudication_pending"
  | "appeal"
  | "closed_suitable"
  | "closed_unsuitable"
  | "closed_conditional"
  | "closed_withdrawn";

type RoleProfileState = "draft" | "pending_sign_off" | "active" | "retired";

const caseLabels: Record<
  CaseState,
  { label: string; tone: "neutral" | "accentSoft" | "warn" | "success" | "danger" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  consent_pending: { label: "Awaiting candidate consent", tone: "warn" },
  evidence_gathering: { label: "Gathering evidence", tone: "accentSoft" },
  evidence_held: { label: "Paused — review needed", tone: "warn" },
  synthesis: { label: "Reviewing evidence", tone: "accentSoft" },
  decision_drafting: { label: "Awaiting decision", tone: "accentSoft" },
  right_of_reply: { label: "Awaiting candidate response", tone: "warn" },
  adjudication_pending: { label: "Awaiting adjudicator", tone: "warn" },
  appeal: { label: "Under appeal", tone: "warn" },
  closed_suitable: { label: "Suitable — closed", tone: "success" },
  closed_unsuitable: { label: "Unsuitable — closed", tone: "danger" },
  closed_conditional: { label: "Conditional — closed", tone: "accentSoft" },
  closed_withdrawn: { label: "Withdrawn", tone: "neutral" },
};

const roleLabels: Record<
  RoleProfileState,
  { label: string; tone: "neutral" | "warn" | "success" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_sign_off: { label: "Pending sign-off", tone: "warn" },
  active: { label: "Active", tone: "success" },
  retired: { label: "Retired", tone: "neutral" },
};

export function CaseStatePill({ state }: { state: CaseState }) {
  const { label, tone } = caseLabels[state];
  return <Badge tone={tone}>{label}</Badge>;
}

export function RoleProfileStatePill({ state }: { state: RoleProfileState }) {
  const { label, tone } = roleLabels[state];
  return <Badge tone={tone}>{label}</Badge>;
}
