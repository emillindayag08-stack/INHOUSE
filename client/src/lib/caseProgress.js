import { deadlineUrgency, urgencyTone } from "./deadlines.js";
import { casePhase } from "./constants.js";

// Where a case stands, and what its parties owe — in plain language.
//
// The eight stages below are the process as a complainant or respondent
// experiences it, not the 17 CaseStatus values the server tracks. Labels avoid
// enum names and legal Latin: "Initial review", not "Prima facie evaluation".
//
// Pure: no React, no network. Every function takes either a row from
// GET /api/cases or the fuller GET /api/cases/:id payload — both carry status,
// yourSide, deadlines, documents, finalPathway and complainantPathwayChoice —
// so the case page can adopt this later without a signature change.
//
// One wart worth knowing: on the Position Paper pathway the server leaves the
// case at FORMAL_CHARGE_ISSUED while the parties file their papers, and only
// then jumps to DELIBERATION. So the strip can read "Answers & pathway" while
// yourTurn() asks for a position paper. That is deliberate — the strip tracks
// the case's official status, the turn line tracks your own task.

export const CLOSED_STATUSES = new Set(["DISMISSED", "RESOLVED", "ESCALATED"]);

// The dashboard's stat cards are shortcuts into the Cases page: each one links
// to /cases?view=<key>, and these decide what that shows. They deliberately
// match how the cards are counted, so the figure clicked is the figure listed.
export const CASE_VIEWS = {
  active: {
    label: "Active cases",
    matches: (c) => !CLOSED_STATUSES.has(c.status),
  },
  overdue: {
    label: "Cases with an overdue deadline",
    matches: (c) => (c.deadlines || []).some((d) => d.status === "OVERDUE"),
  },
  closed: {
    label: "Closed cases",
    matches: (c) => c.status === "RESOLVED" || c.status === "DISMISSED",
  },
};

// Serving the show-cause order is what hands the case to the respondent and
// opens each side's filings to the other; before it, the case is intake and
// only CODI sees it. Mirrors documentsShared() in the server's
// services/caseAccess.js, reading the same stamped fact — the payload itself
// is filtered the same way, so this only decides what the page offers to show.
export function documentsShared(caseDetail) {
  return Boolean(caseDetail?.respondentAssignedAt);
}

// Stage 7's label depends on which route the case took; before the Secretariat
// sets the pathway nobody knows yet, so it says so.
const PATHWAY_STAGE_LABELS = {
  FORMAL_INVESTIGATION: "Hearings",
  POSITION_PAPER: "Position papers",
  null: "Hearings or papers",
};

const STAGES = [
  { key: "FILED", label: "Complaint filed" },
  { key: "CHECKED", label: "Checked by CODI" },
  { key: "NOTIFIED", label: "Respondent notified" },
  { key: "REVIEW", label: "Initial review" },
  { key: "CHARGE", label: "Formal charge" },
  { key: "ANSWERS", label: "Answers & pathway" },
  { key: "PATHWAY", label: "Hearings or papers" },
  { key: "DECISION", label: "Decision" },
];

export const TOTAL_STAGES = STAGES.length;

// Which stage each status puts the case in (1-based).
const STAGE_BY_STATUS = {
  SUBMITTED: 1,
  RETURNED_FOR_CORRECTION: 1,
  VERIFIED: 2,
  SHOW_CAUSE_PENDING_APPROVAL: 2,
  SHOW_CAUSE_APPROVED: 2,
  SHOW_CAUSE_ISSUED: 3,
  ANSWER_UNDER_REVIEW: 4,
  ANSWER_SUBMITTED: 4,
  UNDER_EVALUATION: 4,
  PRIMA_FACIE_NOT_FOUND: 4,
  PRIMA_FACIE_FOUND: 5,
  FORMAL_CHARGE_PENDING_APPROVAL: 5,
  FORMAL_CHARGE_ISSUED: 6,
  HEARING_SCHEDULED: 7,
  FORMAL_INVESTIGATION_ENDED: 7,
  DELIBERATION: 7,
  DECIDED: 8,
  RESOLVED: 8,
  DISMISSED: 8,
  ESCALATED: 8,
};

export function stageIndexFor(status) {
  return STAGE_BY_STATUS[status] ?? 1;
}

// An anonymous complainant follows their complaint only until CODI verifies
// it. From then on it is CODI's case, and how it proceeds against the
// respondent is not theirs to track. They still learn that it has closed.
export function progressHidden(c) {
  return (
    c.yourSide === "COMPLAINANT" &&
    Boolean(c.isAnonymous) &&
    stageIndexFor(c.status) >= 2 &&
    !CLOSED_STATUSES.has(c.status)
  );
}

// The status this viewer sees for a case: one of the nine CASE_PHASES, or
// Verified for an anonymous complainant past verification. Everything that
// shows, filters or sorts by status goes through this, so nothing gives away
// what progressHidden() hides.
export function displayPhase(c) {
  return progressHidden(c) ? "VERIFIED" : casePhase(c.status, c.finalPathway);
}

const docsOfType = (c, docType) => (c.documents || []).filter((d) => d.docType === docType);
const deadlineFor = (c, stage) => (c.deadlines || []).find((d) => d.stage === stage) || null;

// A deadline whose window has closed: the respondent can no longer answer.
// Same test the case page uses before offering the answer form.
function lapsed(deadline) {
  if (!deadline || deadline.status === "MET") return false;
  return deadline.status === "OVERDUE" || new Date(deadline.dueAt) < new Date();
}

// Where a dismissed case actually stopped. The list payload carries no audit
// trail, so this reads the marks the process leaves behind: a case number is
// minted only when a prima facie case is found, and a pathway is only ever set
// after the formal charge.
function dismissedStopIndex(c) {
  const intake = deadlineFor(c, "NOTARIZED COMPLAINT");
  const hasNotarizedComplaint = docsOfType(c, "COMPLAINT").some((d) => d.reviewStatus === "APPROVED");
  if (intake?.status === "OVERDUE" && !hasNotarizedComplaint) {
    return { index: 1, note: "Closed — the notarized complaint was not filed in time." };
  }
  if (!c.caseNumber) {
    return { index: 4, note: "Closed — no case to answer was found." };
  }
  if (c.finalPathway) {
    return { index: 8, note: "Closed — the complaint was not upheld." };
  }
  return { index: 6, note: "Closed before the case was heard." };
}

// The eight stages with a state each: done | current | upcoming | stopped.
// A case that ended early stops where it ended — it must never look as though
// it completed every stage.
export function caseProgress(c) {
  const isClosed = CLOSED_STATUSES.has(c.status);
  let currentIndex = stageIndexFor(c.status);
  let stoppedIndex = null;
  let closedNote = null;

  if (c.status === "DISMISSED") {
    const stop = dismissedStopIndex(c);
    stoppedIndex = stop.index;
    currentIndex = stop.index;
    closedNote = stop.note;
  } else if (c.status === "ESCALATED") {
    stoppedIndex = 8;
    currentIndex = 8;
    closedNote = "Escalated to a higher authority.";
  } else if (c.status === "RESOLVED") {
    closedNote = "Closed — a decision has been recorded.";
  }

  const stages = STAGES.map((stage, i) => {
    const index = i + 1;
    const label =
      stage.key === "PATHWAY" ? PATHWAY_STAGE_LABELS[c.finalPathway] ?? PATHWAY_STAGE_LABELS.null : stage.label;
    let state;
    if (stoppedIndex !== null) {
      state = index < stoppedIndex ? "done" : index === stoppedIndex ? "stopped" : "upcoming";
    } else if (c.status === "RESOLVED") {
      state = "done";
    } else {
      state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
    }
    return { key: stage.key, label, index, state };
  });

  return { stages, currentIndex, total: TOTAL_STAGES, isClosed, closedNote };
}

// What this person has to do on this case right now, or null when the ball is
// with CODI or the other party. Mirrors the conditions the case page uses to
// show its action cards, so the dashboard never offers something the case page
// would refuse.
export function yourTurn(c, user) {
  const side = c.yourSide;
  if (!side || CLOSED_STATUSES.has(c.status)) return null;

  const isComplainant = side === "COMPLAINANT";
  const isRespondent = side === "RESPONDENT";
  const caseHref = `/cases/${c.id}`;
  // Cleared at the prima facie stage: the case no longer asks anything of them.
  if (isRespondent && (c.respondents || []).find((r) => r.userId === user?.id)?.primaFacieFound === false) {
    return null;
  }
  const withDeadline = (turn, stage) => {
    const deadline = deadlineFor(c, stage);
    if (!deadline || deadline.status === "MET") return turn;
    return { ...turn, urgency: deadlineUrgency(deadline.status, deadline.dueAt), tone: urgencyTone(deadline.status, deadline.dueAt) };
  };

  // An anonymous complaint is CODI's case once sent: it asks nothing more of
  // its complainant, and is never returned to them for correction.
  if (isComplainant && c.isAnonymous) return null;

  // Intake. Note the third state: a complaint uploaded but not yet confirmed
  // is with the Secretariat, so nothing is owed.
  if (isComplainant && c.status === "SUBMITTED") {
    const complaints = docsOfType(c, "COMPLAINT");
    const rejected = complaints.length > 0 && complaints.every((d) => d.reviewStatus === "RETURNED");
    if (complaints.length === 0) {
      return withDeadline(
        {
          title: "Upload your notarized complaint.",
          detail: "Have the complaint notarized, then upload a scan or a clear photo of it.",
          cta: "Upload now",
          href: caseHref,
        },
        "NOTARIZED COMPLAINT"
      );
    }
    if (rejected) {
      return withDeadline(
        {
          title: "Upload your notarized complaint again.",
          detail: "The Secretariat could not confirm the copy you sent as notarized.",
          cta: "Upload now",
          href: caseHref,
        },
        "NOTARIZED COMPLAINT"
      );
    }
    return null;
  }

  if (isComplainant && c.status === "RETURNED_FOR_CORRECTION") {
    return withDeadline(
      {
        title: "Fix and resubmit your complaint.",
        detail: "The Secretariat returned it for correction — open it to see what needs changing.",
        cta: "Edit complaint",
        href: `/cases/${c.id}/edit`,
      },
      "NOTARIZED COMPLAINT"
    );
  }

  if (isRespondent && c.status === "SHOW_CAUSE_ISSUED") {
    if (lapsed(deadlineFor(c, "RESPONDENT RESPONSE"))) return null; // window closed
    return withDeadline(
      {
        title: "Respond to the show-cause order.",
        detail:
          "Upload your notarized response. If you don't respond in time, CODI proceeds on the records it already has.",
        cta: "Respond now",
        href: caseHref,
      },
      "RESPONDENT RESPONSE"
    );
  }

  if (c.status === "FORMAL_CHARGE_ISSUED") {
    if (isRespondent) {
      const answers = docsOfType(c, "RESPONDENT_ANSWER");
      const confirmed = answers.some((d) => d.reviewStatus === "APPROVED");
      if (!confirmed) {
        const returned = answers.some((d) => d.reviewStatus === "RETURNED");
        if (answers.length === 0 || returned) {
          return withDeadline(
            {
              title: returned
                ? "Upload your notarized answer again."
                : "Submit your notarized answer to the formal charge.",
              detail: returned
                ? "The Secretariat could not confirm your last answer as notarized."
                : "Write your answer to the charge, have it notarized, then upload it.",
              cta: "Open case",
              href: caseHref,
            },
            "ANSWER TO CHARGE"
          );
        }
        return null; // filed, waiting on the Secretariat's review
      }
    }

    if (isComplainant && !c.complainantPathwayChoice) {
      return {
        title: "Choose how this case proceeds.",
        detail:
          "Position Paper (decided on written submissions) or Formal Investigation (hearings you attend).",
        cta: "Choose pathway",
        href: caseHref,
      };
    }

    // Position Paper pathway: each side files their own paper.
    if (c.finalPathway === "POSITION_PAPER") {
      const mine = docsOfType(c, "POSITION_PAPER").filter((d) => d.uploadedById === user?.id);
      const confirmed = mine.some((d) => d.reviewStatus === "APPROVED");
      const returned = mine.some((d) => d.reviewStatus === "RETURNED");
      if (!confirmed && (mine.length === 0 || returned)) {
        return withDeadline(
          {
            title: returned
              ? "Upload your notarized position paper again."
              : "Upload your notarized position paper.",
            detail: returned
              ? "The Secretariat could not confirm your paper as notarized."
              : "There are no hearings on this pathway — your written paper is how you put your side, and it must be notarized.",
            cta: "Upload now",
            href: caseHref,
          },
          isComplainant ? "POSITION PAPER COMPLAINANT" : "POSITION PAPER"
        );
      }
    }
    return null;
  }

  if (c.status === "HEARING_SCHEDULED") {
    return {
      title: "Attend your hearing.",
      detail: "Check your calendar for the date, the time and how to appear.",
      cta: "See your calendar",
      href: "/calendar",
      tone: "info",
    };
  }

  return null;
}

// What CODI is doing while nothing is owed — so "no action needed" never reads
// as "nothing is happening".
export function waitingOn(c) {
  const isComplainant = c.yourSide === "COMPLAINANT";
  switch (c.status) {
    case "SUBMITTED": {
      // Two different waits hide behind one status: the notarized copy is
      // still being checked, or it's confirmed and the complaint itself is
      // now being reviewed.
      const confirmed = docsOfType(c, "COMPLAINT").some((d) => d.reviewStatus === "APPROVED");
      if (!isComplainant) return "the Secretariat is checking the complaint.";
      return confirmed
        ? "your notarized complaint is on file; the Secretariat is reviewing it."
        : "the Secretariat is checking the notarized copy you uploaded.";
    }
    case "RETURNED_FOR_CORRECTION":
      return "the complainant is correcting the complaint.";
    case "VERIFIED":
      return "the Secretariat is preparing the show-cause order.";
    case "SHOW_CAUSE_PENDING_APPROVAL": {
      // An order the Chairperson sends back keeps this status, so which of the
      // two waits this is depends on whether one is still with them.
      const orders = c.showCauseOrders;
      const revising =
        Array.isArray(orders) &&
        orders.length > 0 &&
        !orders.some((o) => o.status === "PENDING_APPROVAL");
      return revising
        ? "the Secretariat is revising the show-cause order."
        : "the Chairperson is reviewing the show-cause order.";
    }
    case "SHOW_CAUSE_APPROVED":
      return "the Secretariat is serving the show-cause order on the respondent.";
    case "SHOW_CAUSE_ISSUED":
      return "the respondent has been asked to answer.";
    case "ANSWER_UNDER_REVIEW":
      return isComplainant
        ? "the Secretariat is checking the respondent's notarized response."
        : "the Secretariat is checking your notarized response.";
    case "ANSWER_SUBMITTED":
    case "UNDER_EVALUATION":
      return "the Committee is deciding whether there is a case to answer.";
    case "PRIMA_FACIE_FOUND":
      return "the Secretariat is preparing the formal charge.";
    case "FORMAL_CHARGE_PENDING_APPROVAL":
      return "the formal charge is with the Disciplining Authority for approval.";
    case "FORMAL_CHARGE_ISSUED":
      return "the other party's response and the pathway decision are still outstanding.";
    case "HEARING_SCHEDULED":
      return "the hearings are under way.";
    case "FORMAL_INVESTIGATION_ENDED":
      return "the hearings are over; the Committee is preparing its recommendation.";
    case "DELIBERATION":
      return "the Committee is deliberating on the papers filed.";
    case "DECIDED":
      return "the recommendation has been filed; the decision now rests with the University President.";
    default:
      return "CODI is reviewing the case.";
  }
}

// The respondent's answer window has closed — they owe nothing, but saying
// "waiting on CODI" would misrepresent why.
export function windowClosed(c) {
  return (
    c.yourSide === "RESPONDENT" &&
    c.status === "SHOW_CAUSE_ISSUED" &&
    lapsed(deadlineFor(c, "RESPONDENT RESPONSE"))
  );
}
