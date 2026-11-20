// The nine statuses people see. The workflow still runs on the 20 detailed
// CaseStatus values (schema.prisma), which decide what each step allows; these
// group them by phase of the process, so a case reads the same in every list,
// report and export. Mirrored in client/src/lib/constants.js (CASE_PHASES).

export const CASE_PHASES = [
  { key: "FILED", label: "Filed" },
  { key: "VERIFIED", label: "Verified" },
  { key: "AWAITING_RESPONSE", label: "Awaiting Response" },
  { key: "PRIMA_FACIE_EVALUATION", label: "Prima Facie Evaluation" },
  { key: "FORMAL_CHARGE", label: "Formal Charge" },
  { key: "INVESTIGATION", label: "Investigation" },
  { key: "FOR_DECISION", label: "For Decision" },
  { key: "RESOLVED", label: "Resolved" },
  { key: "DISMISSED", label: "Dismissed" },
];

export const CASE_PHASE_KEYS = CASE_PHASES.map((p) => p.key);
export const CASE_PHASE_LABELS = Object.fromEntries(CASE_PHASES.map((p) => [p.key, p.label]));

const PHASE_BY_STATUS = {
  SUBMITTED: "FILED",
  RETURNED_FOR_CORRECTION: "FILED",
  VERIFIED: "VERIFIED",
  SHOW_CAUSE_PENDING_APPROVAL: "VERIFIED",
  SHOW_CAUSE_APPROVED: "VERIFIED",
  SHOW_CAUSE_ISSUED: "AWAITING_RESPONSE",
  ANSWER_UNDER_REVIEW: "AWAITING_RESPONSE",
  ANSWER_SUBMITTED: "PRIMA_FACIE_EVALUATION",
  UNDER_EVALUATION: "PRIMA_FACIE_EVALUATION",
  PRIMA_FACIE_FOUND: "FORMAL_CHARGE",
  FORMAL_CHARGE_PENDING_APPROVAL: "FORMAL_CHARGE",
  FORMAL_CHARGE_ISSUED: "FORMAL_CHARGE",
  HEARING_SCHEDULED: "INVESTIGATION",
  FORMAL_INVESTIGATION_ENDED: "INVESTIGATION",
  DELIBERATION: "FOR_DECISION",
  DECIDED: "FOR_DECISION",
  RESOLVED: "RESOLVED",
  ESCALATED: "RESOLVED",
  DISMISSED: "DISMISSED",
  PRIMA_FACIE_NOT_FOUND: "DISMISSED",
};

// A case stays at FORMAL_CHARGE_ISSUED while the respondent answers and, on the
// Position Paper pathway, while the papers are filed. Once a pathway is set the
// charge stage is over, so it reads as Investigation.
export function casePhase(status, finalPathway) {
  if (status === "FORMAL_CHARGE_ISSUED" && finalPathway && finalPathway !== "NOT_YET_SET") return "INVESTIGATION";
  return PHASE_BY_STATUS[status] ?? "FILED";
}
