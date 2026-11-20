// What kind of account this is. Which side of a case someone is on is a
// different thing entirely — see CASE_SIDE_LABELS.
// What to call someone's account. A party's label depends on their standing
// in the directory, so use accountLabel(user) rather than ROLE_LABELS alone.
export function accountLabel(user) {
  if (user?.role === "PARTY") {
    if (user.userType === "STUDENT") return "Student";
    if (user.userType === "PERSONNEL") return "Personnel";
  }
  return ROLE_LABELS[user?.role] ?? "";
}

export const ROLE_LABELS = {
  PARTY: "University Member",
  SECRETARIAT: "CODI Secretariat",
  CHAIRPERSON: "CODI Chairperson",
  COMMITTEE: "CODI Committee",
  DISCIPLINING_AUTHORITY: "Disciplining Authority",
};

// Which side of a particular case someone is on.
export const CASE_SIDE_LABELS = {
  COMPLAINANT: "Complainant",
  RESPONDENT: "Respondent",
};

export const STATUS_LABELS = {
  SUBMITTED: "Submitted",
  RETURNED_FOR_CORRECTION: "Returned for Correction",
  VERIFIED: "Verified",
  SHOW_CAUSE_PENDING_APPROVAL: "Show-Cause Pending Approval",
  SHOW_CAUSE_APPROVED: "Show-Cause Approved",
  SHOW_CAUSE_ISSUED: "Show-Cause Issued",
  ANSWER_UNDER_REVIEW: "Response Under Review",
  ANSWER_SUBMITTED: "Answer Submitted",
  UNDER_EVALUATION: "Under Evaluation",
  PRIMA_FACIE_FOUND: "Prima Facie Found",
  FORMAL_CHARGE_PENDING_APPROVAL: "Charge Awaiting Approval",
  PRIMA_FACIE_NOT_FOUND: "No Prima Facie Case",
  FORMAL_CHARGE_ISSUED: "Formal Charge Sent",
  HEARING_SCHEDULED: "Hearing Scheduled",
  FORMAL_INVESTIGATION_ENDED: "Formal Investigation Ended",
  DELIBERATION: "In Deliberation",
  DECIDED: "Recommendation Filed",
  DISMISSED: "Dismissed",
  RESOLVED: "Resolved",
  ESCALATED: "Escalated",
};

// The nine statuses people see. The workflow still runs on the 20 detailed
// CaseStatus values above (STATUS_LABELS names each as "the current step");
// these group them by phase of the process, so a case reads the same in every
// list, filter and report. Mirrors server/src/utils/casePhase.js.
//
// Colours run along the process, blue at filing through violet, teal, green,
// yellow and orange; Resolved is a deep green and Dismissed gray. `hex` is the
// same colour for charts.
export const CASE_PHASES = [
  { key: "FILED", label: "Filed", color: "bg-[#1D4ED8] text-white", hex: "#1D4ED8" },
  { key: "VERIFIED", label: "Verified", color: "bg-[#3B82F6] text-white", hex: "#3B82F6" },
  { key: "AWAITING_RESPONSE", label: "Awaiting Response", color: "bg-[#8B5CF6] text-white", hex: "#8B5CF6" },
  { key: "PRIMA_FACIE_EVALUATION", label: "Prima Facie Evaluation", color: "bg-[#14B8A6] text-white", hex: "#14B8A6" },
  { key: "FORMAL_CHARGE", label: "Formal Charge", color: "bg-[#22C55E] text-white", hex: "#22C55E" },
  { key: "INVESTIGATION", label: "Investigation", color: "bg-[#EAB308] text-neutral-900", hex: "#EAB308" },
  { key: "FOR_DECISION", label: "For Decision", color: "bg-[#F97316] text-white", hex: "#F97316" },
  { key: "RESOLVED", label: "Resolved", color: "bg-[#15803D] text-white", hex: "#15803D" },
  { key: "DISMISSED", label: "Dismissed", color: "bg-[#D1D5DB] text-neutral-800", hex: "#9CA3AF" },
];

export const CASE_PHASE_LABELS = Object.fromEntries(CASE_PHASES.map((p) => [p.key, p.label]));
export const CASE_PHASE_COLORS = Object.fromEntries(CASE_PHASES.map((p) => [p.key, p.color]));
export const CASE_PHASE_HEX = Object.fromEntries(CASE_PHASES.map((p) => [p.key, p.hex]));
export const CASE_PHASE_ORDER = CASE_PHASES.map((p) => p.key);

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

// The Section 12 (2025 RACCS) condition an anonymous complaint is filed under,
// as the filing form words it.
export const ANONYMOUS_GROUND_LABELS = {
  PUBLIC_KNOWLEDGE: "Many people already know about it (public knowledge)",
  VERIFIABLE: "It can be checked (verifiable)",
  DOCUMENTARY_EVIDENCE: "The filer has strong evidence (documentary or direct evidence)",
  AGENCY_REFERRAL: "An office already looked into it (referred by an agency)",
};

export const GOVERNING_FRAMEWORK_LABELS = {
  GBSH_CODE: "BulSU Anti-GBSH Code",
  RACCS: "RACCS 2025 (Civil Service)",
};

export const REVIEWABLE_DOC_LABELS = {
  COMPLAINT: "Notarized complaint",
  SHOW_CAUSE_ANSWER: "Response to the show-cause order",
  RESPONDENT_ANSWER: "Formal written answer",
  POSITION_PAPER: "Position paper",
};

// Every kind of document, for the Records page. REVIEWABLE_DOC_LABELS above
// covers only the four a party files and the Secretariat reviews.
export const DOC_TYPE_LABELS = {
  COMPLAINT: "Notarized complaint",
  EVIDENCE: "Evidence",
  SHOW_CAUSE_ORDER: "Show-cause order",
  SHOW_CAUSE_ANSWER: "Response to the show-cause order",
  FORMAL_CHARGE: "Formal charge",
  RESPONDENT_ANSWER: "Answer to the formal charge",
  POSITION_PAPER: "Position paper",
  HEARING_MINUTES: "Hearing minutes",
  DELIBERATION_NOTES: "CODI report",
  RECOMMENDATION: "Recommendation",
  DECISION: "Decision",
  OTHER: "Supporting record",
};

export const DOC_REVIEW_LABELS = {
  PENDING: "CODI is reviewing this document",
  APPROVED: "Approved",
  RETURNED: "Sent back",
};

// Evidence is not checked for notarization the way a party's filing is — it is
// material the Committee weighs. "CODI is reviewing this document" and
// "Approved" are the wrong words for it, so it gets its own.
const EVIDENCE_REVIEW_LABELS = {
  PENDING: "Awaiting the Committee",
  APPROVED: "Considered",
  RETURNED: "Sent back",
};

export function docReviewLabel(doc) {
  const labels = doc?.docType === "EVIDENCE" ? EVIDENCE_REVIEW_LABELS : DOC_REVIEW_LABELS;
  return labels[doc?.reviewStatus] || doc?.reviewStatus || "";
}

export const DOC_REVIEW_COLORS = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  RETURNED: "bg-red-100 text-red-800",
};

export const OFFENSE_CLASSIFICATION_LABELS = {
  LIGHT: "Light Offense",
  LESS_GRAVE: "Less Grave Offense",
  GRAVE: "Grave Offense",
};

export const OFFENSE_CLASSIFICATION_COLORS = {
  LIGHT: "bg-green-100 text-green-800",
  LESS_GRAVE: "bg-amber-100 text-amber-800",
  GRAVE: "bg-red-100 text-red-800",
};

// Deadline records store their stage as an underscore-free but still
// all-caps string (see deadlineService.js's createDeadline, which does
// stage.replace(/_/g, " ")) — e.g. "NOTARIZED COMPLAINT". These map that raw
// stage text to plain-language phrasing for the calendar. Any stage not
// listed here falls back to a simple title-case of the raw text.
export const DEADLINE_STAGE_LABELS = {
  "NOTARIZED COMPLAINT": "Submit notarized complaint",
  "RESPONDENT RESPONSE": "Respondent's response is due",
  "CODI REPORT": "CODI committee report is due",
  "REPORT TO PRESIDENT": "Report to the President is due",
  "FORMAL CHARGE": "Formal charge is due",
  "ANSWER TO CHARGE": "Answer to the formal charge is due",
  "POSITION PAPER": "Position paper is due",
  "POSITION PAPER COMPLAINANT": "Complainant's position paper is due",
  "PRESIDENT DECISION": "President's decision is due",
  "PRELIMINARY INVESTIGATION COMPLETION": "Preliminary investigation should be complete",
};

export const PATHWAY_LABELS = {
  FORMAL_INVESTIGATION: "Formal Investigation",
  POSITION_PAPER: "Position Paper",
};

export const PATHWAY_COLORS = {
  FORMAL_INVESTIGATION: "bg-blue-100 text-blue-800",
  POSITION_PAPER: "bg-purple-100 text-purple-800",
};

export const HEARING_TYPE_LABELS = {
  PRE_TRIAL: "Pre-Trial",
  TRIAL: "Trial",
};

// Best-effort starting point for the Committee's deliberation recommendation,
// based on the case's risk classification, governing framework, and whether
// this is the respondent's first offense (see the BulSU Anti-GBSH Code /
// RACCS 2025 penalty schedules below). This is only a prefill — the
// Committee is expected to review and edit it before submitting; it does not
// attempt to capture every nuance in the schedule (e.g. organization-based or
// contract-based sanctions, accessory penalties, additional corrective
// measures like counseling or gender sensitivity training).
export function getRecommendationSuggestion(governingFramework, classification, isFirstOffense) {
  if (governingFramework === "GBSH_CODE") {
    switch (classification) {
      case "LIGHT":
        return isFirstOffense
          ? "Reprimand (written or oral)."
          : "Suspension, given this is a repeat offense; community service (30–60 hours) may be imposed in lieu where appropriate.";
      case "LESS_GRAVE":
        return "Suspension; community service (30–60 hours) may be imposed in lieu where appropriate.";
      case "GRAVE":
        return "Expulsion.";
      default:
        return "";
    }
  }
  if (governingFramework === "RACCS") {
    switch (classification) {
      case "LIGHT":
        return "Fine (up to 30 days' salary, depending on the offense).";
      case "LESS_GRAVE":
        return "Suspension from government service.";
      case "GRAVE":
        return "Dismissal from the service.";
      default:
        return "";
    }
  }
  return "";
}

// BulSU's colleges, offered as a fixed choice wherever a department is tied
// to an academic unit (e.g. the respondent's department when filing a
// complaint) rather than free text.
// What a complainant may type, matching the limits the API enforces.
export const DESCRIPTION_MAX = 4000;
export const RESPONDENT_NAME_MAX = 100;
// A note sent back with a returned filing (see the show-cause review card).
export const RETURN_NOTE_MAX = 1000;
// Evidence links one person may add to a case (uploads are separate and
// uncapped). Mirrors EVIDENCE_LINK_MAX in server/src/routes/documents.routes.js.
export const EVIDENCE_LINK_MAX = 3;

// The audit trail's action strings, in readable form. `action` is an
// unconstrained String on the server, so anything missing here falls back to
// the raw value prettified — see auditActionLabel() below.
export const AUDIT_ACTION_LABELS = {
  // Intake
  COMPLAINT_SUBMITTED: "Complaint filed",
  COMPLAINT_EDITED: "Complaint edited",
  COMPLAINT_VERIFICATION: "Complaint verification",
  RESPONDENT_CONFIRMED: "Respondent confirmed",
  // Show-cause
  SHOW_CAUSE_DRAFTED: "Show-cause order drafted",
  SHOW_CAUSE_APPROVED: "Show-cause order approved",
  SHOW_CAUSE_RETURNED: "Show-cause order returned",
  SHOW_CAUSE_SERVED: "Show-cause order served",
  ANSWER_SUBMITTED: "Response filed",
  ANSWER_APPROVED: "Response accepted",
  PROCEEDED_WITHOUT_RESPONSE: "Proceeded without a response",
  // Committee
  SCHEDULING_ROUND_PROPOSED: "Meeting slots proposed",
  SCHEDULING_VOTE_UPDATED: "Availability updated",
  SCHEDULING_FINALIZED: "Meeting confirmed",
  PRIMA_FACIE_VOTE: "Prima facie vote",
  PRIMA_FACIE_EVALUATION: "Prima facie evaluation",
  RISK_ASSESSMENT_RECORDED: "Risk assessment recorded",
  RISK_ASSESSMENT_OVERRIDDEN: "Risk assessment overridden",
  // Charge
  FORMAL_CHARGE_DRAFTED: "Formal charge drafted",
  FORMAL_CHARGE_APPROVED: "Formal charge approved",
  FORMAL_CHARGE_RETURNED: "Formal charge returned",
  FORMAL_CHARGE_ISSUED: "Formal charge issued",
  FORMAL_ANSWER_SUBMITTED: "Answer to the charge filed",
  PATHWAY_CHOSEN: "Pathway chosen by a party",
  PATHWAY_RECOMMENDED: "Pathway set",
  // Hearings
  HEARING_SCHEDULED: "Hearing scheduled",
  HEARING_NOTE_UPDATED: "Hearing note updated",
  FORMAL_INVESTIGATION_ENDED: "Formal investigation ended",
  // Outcome
  RECOMMENDATION_FILED: "Recommendation filed",
  INVESTIGATION_OUTCOME_FILED: "Investigation outcome filed",
  DELIBERATION_RECORDED: "Deliberation recorded",
  DECISION_RECORDED: "Decision recorded",
  CASE_DISMISSED_NONCOMPLIANCE: "Dismissed for non-compliance",
  CASE_DISMISSED_BY_SECRETARIAT: "Dismissed by the Secretariat",
  // Documents
  DOCUMENT_UPLOADED: "Document uploaded",
  DOCUMENT_REVIEWED: "Document reviewed",
  DOCUMENT_DISPOSAL_APPROVED: "File disposal approved",
  CASE_REOPENED: "Case reopened",
  TRUSTED_DEVICES_FORGOTTEN: "Trusted browsers forgotten",
  ACCOUNT_LOCKED: "Account locked",
  ACCOUNT_UNLOCKED: "Account unlocked",
  ACCOUNT_DEACTIVATED: "Account deactivated",
  ACCOUNT_REACTIVATED: "Account reactivated",
  DOCUMENT_REMOVED: "Document removed",
  EVIDENCE_UPLOADED: "Evidence added",
  // System
  ACCOUNT_PROVISIONED: "Account created",
  PASSWORD_CHANGED: "Password changed",
  REPORT_EXPORTED: "Report exported",
  FAQ_UPDATED: "FAQs updated",
  COMPLAINT_NOT_ENTERTAINED: "Not entertained (Section 12)",
};

// The filter dropdown, grouped so forty options stay navigable. Order is the
// order a case moves through.
export const AUDIT_ACTION_GROUPS = [
  { label: "Intake", actions: ["COMPLAINT_SUBMITTED", "COMPLAINT_EDITED", "COMPLAINT_VERIFICATION", "COMPLAINT_NOT_ENTERTAINED", "RESPONDENT_CONFIRMED"] },
  { label: "Show-cause", actions: ["SHOW_CAUSE_DRAFTED", "SHOW_CAUSE_APPROVED", "SHOW_CAUSE_RETURNED", "SHOW_CAUSE_SERVED", "ANSWER_SUBMITTED", "ANSWER_APPROVED", "PROCEEDED_WITHOUT_RESPONSE"] },
  { label: "Committee", actions: ["SCHEDULING_ROUND_PROPOSED", "SCHEDULING_VOTE_UPDATED", "SCHEDULING_FINALIZED", "PRIMA_FACIE_VOTE", "PRIMA_FACIE_EVALUATION", "RISK_ASSESSMENT_RECORDED", "RISK_ASSESSMENT_OVERRIDDEN"] },
  { label: "Formal charge", actions: ["FORMAL_CHARGE_DRAFTED", "FORMAL_CHARGE_APPROVED", "FORMAL_CHARGE_RETURNED", "FORMAL_CHARGE_ISSUED", "FORMAL_ANSWER_SUBMITTED", "PATHWAY_CHOSEN", "PATHWAY_RECOMMENDED"] },
  { label: "Hearings", actions: ["HEARING_SCHEDULED", "HEARING_NOTE_UPDATED", "FORMAL_INVESTIGATION_ENDED"] },
  { label: "Outcome", actions: ["RECOMMENDATION_FILED", "INVESTIGATION_OUTCOME_FILED", "DELIBERATION_RECORDED", "DECISION_RECORDED", "CASE_DISMISSED_NONCOMPLIANCE", "CASE_DISMISSED_BY_SECRETARIAT", "CASE_REOPENED"] },
  { label: "Documents", actions: ["DOCUMENT_UPLOADED", "DOCUMENT_REVIEWED", "DOCUMENT_REMOVED", "EVIDENCE_UPLOADED", "DOCUMENT_DISPOSAL_APPROVED"] },
  { label: "System", actions: ["ACCOUNT_PROVISIONED", "PASSWORD_CHANGED", "REPORT_EXPORTED", "FAQ_UPDATED"] },
];

// A new action string added on the server should still read as something.
export function auditActionLabel(action) {
  if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
  if (!action) return "";
  const words = action.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const BULSU_COLLEGES = [
  "College of Architecture and Fine Arts (CAFA)",
  "College of Arts and Letters (CAL)",
  "College of Business Education and Accountancy (CBEA)",
  "College of Criminal Justice Education (CCJE)",
  "College of Engineering (COE)",
  "College of Hospitality and Tourism Management (CHTM)",
  "College of Information and Communications Technology (CICT)",
  "College of Industrial Technology (CIT)",
  "College of Law (CLaw)",
  "College of Nursing (CN)",
  "College of Professional Teacher Education (CPTED)",
  "College of Science (CS)",
  "College of Social Sciences and Philosophy (CSSP)",
  "College of Sports, Exercise and Recreation (CSER)",
];

export const DECISION_OUTCOME_LABELS = {
  LIABLE: "Liable",
  NOT_LIABLE: "Not Liable",
};

export const DECISION_OUTCOME_COLORS = {
  LIABLE: "bg-red-100 text-red-800",
  NOT_LIABLE: "bg-green-100 text-green-800",
};

// A case has a caseNumber (CODI-YYYY-NNNN) only from PRIMA_FACIE_FOUND
// onward; before that, and for cases dismissed without a prima facie
// finding, only referenceNumber (REF-YYYY-NNNN) exists. Every UI surface
// that displays a case's number should go through these so the fallback
// logic lives in exactly one place.
export function caseLabel(c) {
  return c?.caseNumber || c?.cpiNumber || c?.referenceNumber || "";
}

export function caseLabelPrefix(c) {
  return c?.caseNumber ? "Case No." : c?.cpiNumber ? "CPI No." : "Ref. No.";
}
