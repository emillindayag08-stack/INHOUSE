import {
  CURRENT_DOCUMENTS,
  documentAttached,
  documentsShared,
  isCoRespondentFiling,
} from "./caseAccess.js";
import { frameworkFor, respondentRowFor } from "./respondentService.js";

// What a case looks like to one viewer. The case page (GET /api/cases/:id) and
// the AI assistant both read a case through here, so the assistant can never
// tell anyone more than their own case page would.

export const CASE_DETAIL_INCLUDE = {
  complainant: { select: { id: true, fullName: true, email: true, department: true } },
  // The respondent's account, named so CODI always knows whose it is. No
  // Secretariat — see the GET /:id handler below.
  respondentUser: {
    select: { id: true, fullName: true, email: true, department: true, userType: true, directoryId: true },
  },
  // Everyone the complaint names, in the order it names them.
  respondents: {
    orderBy: { position: "asc" },
    include: {
      user: { select: { id: true, fullName: true, email: true, department: true, userType: true, directoryId: true } },
    },
  },
  documents: { where: CURRENT_DOCUMENTS, include: { uploadedBy: { select: { id: true, fullName: true } } } },
  // The relations below all carry a "who made this call" FK already — every
  // include here surfaces it so decisions can be attributed to the CODI
  // member responsible, not just timestamped. See CaseTimeline.jsx, which
  // renders each as "<label> · by <fullName>".
  showCauseOrders: {
    orderBy: { issuedAt: "asc" },
    include: {
      issuedBy: { select: { id: true, fullName: true } },
      reviewedBy: { select: { id: true, fullName: true } },
      servedBy: { select: { id: true, fullName: true } },
      // The signed order file itself — what the Chairperson reviews and the
      // respondent reads. Pinned per-order so a returned draft keeps its own.
      document: true,
    },
  },
  respondentAnswers: { orderBy: { submittedAt: "asc" } },
  primaFacieEvals: {
    orderBy: { evaluatedAt: "asc" },
    include: { evaluatedBy: { select: { id: true, fullName: true } } },
  },
  // Each Committee member’s vote on the prima facie question; the Secretariat
  // confirms the majority, which is what creates the evaluation above.
  primaFacieVotes: {
    // Votes and scores of members who have since left stay on record but do not count.
    where: { voter: { deactivatedAt: null } },
    orderBy: { votedAt: "asc" },
    include: { voter: { select: { id: true, fullName: true } } },
  },
  riskAssessments: {
    where: { evaluatedBy: { deactivatedAt: null } },
    orderBy: { evaluatedAt: "asc" },
    include: {
      evaluatedBy: { select: { id: true, fullName: true } },
      overriddenBy: { select: { id: true, fullName: true } },
    },
  },
  formalCharges: {
    orderBy: { issuedAt: "asc" },
    include: {
      issuedBy: { select: { id: true, fullName: true } },
      reviewedBy: { select: { id: true, fullName: true } },
      // The drafted charge file — what the Disciplining Authority reads before
      // approving it.
      document: true,
    },
  },
  hearings: {
    orderBy: { scheduledAt: "asc" },
    include: {
      scheduledBy: { select: { id: true, fullName: true } },
      documents: { where: CURRENT_DOCUMENTS, include: { uploadedBy: { select: { id: true, fullName: true } } } },
    },
  },
  deliberations: {
    orderBy: { recordedAt: "asc" },
    include: { recordedBy: { select: { id: true, fullName: true } } },
  },
  decision: { include: { decidedBy: { select: { id: true, fullName: true } } } },
  pathwayRecommendedBy: { select: { id: true, fullName: true } },
  deadlines: { orderBy: { dueAt: "asc" } },
  schedulingRounds: {
    orderBy: { createdAt: "desc" },
    include: {
      slots: {
        include: { votes: { include: { voter: { select: { id: true, fullName: true, role: true } } } } },
      },
      finalizedSlot: true,
      // What a confirmed hearing round produced, so the panel can name it.
      hearing: true,
    },
  },
};

// Who an anonymous complainant is to everyone but themselves. The id stands in
// for theirs everywhere it would appear, so "filed by the complainant" checks
// (uploadedById === complainantId) still hold without naming them.
// An anonymous complaint is CODI's own case against the respondent, so CODI
// stands as the complainant.
export const ANONYMOUS_COMPLAINANT_ID = "anonymous-complainant";
export const ANONYMOUS_COMPLAINANT_NAME = "CODI";
const ANONYMOUS_COMPLAINANT = { id: ANONYMOUS_COMPLAINANT_ID, fullName: ANONYMOUS_COMPLAINANT_NAME };

// Hides an anonymous complainant from anyone else looking at the case: staff
// included. Works on a case loaded with any subset of CASE_DETAIL_INCLUDE (the
// list loads less). Mutates and returns the record.
export function maskAnonymousComplainant(caseRecord, viewerId) {
  if (!caseRecord?.isAnonymous) return caseRecord;
  const realId = caseRecord.complainantId;
  if (!realId || realId === viewerId) return caseRecord;
  caseRecord.complainantId = ANONYMOUS_COMPLAINANT_ID;
  if ("complainant" in caseRecord) caseRecord.complainant = { ...ANONYMOUS_COMPLAINANT };
  const maskDoc = (d) =>
    d.uploadedById === realId
      ? { ...d, uploadedById: ANONYMOUS_COMPLAINANT_ID, ...(d.uploadedBy ? { uploadedBy: { ...ANONYMOUS_COMPLAINANT } } : {}) }
      : d;
  if (caseRecord.documents) caseRecord.documents = caseRecord.documents.map(maskDoc);
  if (caseRecord.hearings) {
    caseRecord.hearings = caseRecord.hearings.map((h) => (h.documents ? { ...h, documents: h.documents.map(maskDoc) } : h));
  }
  return caseRecord;
}

// While the panel is still voting, a respondent's offense level is the running
// result of everyone's offense votes, so a Committee member would read the
// others' votes off it. Hidden from them until the Secretariat confirms the
// finding for that respondent. Mutates and returns the case (detail or list row).
export function hideRunningClassification(caseRecord) {
  if (caseRecord.status !== "ANSWER_SUBMITTED") return caseRecord;
  const rows = caseRecord.respondents || [];
  const undecided = (row) => row.primaFacieFound === null || row.primaFacieFound === undefined;
  for (const row of rows) {
    if (undecided(row) && "offenseClassification" in row) row.offenseClassification = null;
  }
  // The case mirrors its first respondent's level.
  const first = rows.find((r) => r.position === 0) || rows[0];
  if (!first || undecided(first)) caseRecord.offenseClassification = null;
  return caseRecord;
}

// How many members have cast a prima facie vote, per respondent row id (votes
// from before respondents had rows count toward "first").
function countByRespondent(votes = []) {
  const counts = {};
  for (const v of votes) {
    const key = v.respondentRowId || "first";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// Strips from a case loaded with CASE_DETAIL_INCLUDE everything this viewer
// (from caseViewer) may not see. Mutates and returns the record.
export function applyViewerFilters(caseRecord, viewer, userId) {
  // The Committee's individual votes and risk scores are internal
  // deliberation. The parties see the outcome, not how members voted.
  if (viewer.isParty) {
    caseRecord.primaFacieVotes = [];
    caseRecord.riskAssessments = [];
  } else if (viewer.isCommittee) {
    // Each Committee member votes independently: they see their own prima
    // facie and offense-level votes, never the others'. The Secretariat, which
    // confirms the finding, still sees them all. What a member may read of the
    // panel is how many have voted, never which way.
    caseRecord.primaFacieVoteCounts = countByRespondent(caseRecord.primaFacieVotes);
    caseRecord.primaFacieVotes = caseRecord.primaFacieVotes.filter((v) => v.voterId === userId);
    caseRecord.riskAssessments = caseRecord.riskAssessments.filter((a) => a.evaluatedById === userId);
    hideRunningClassification(caseRecord);
  }

  // Until service neither side reads the other's filings; from service on
  // both do. Only the complainant can reach this branch now — an unserved
  // respondent has no side at all, so caseViewer refuses them above.
  // Stripped from the payload, not merely hidden in the UI — the download
  // route applies the same rule (see documents.routes.js).
  if (!documentsShared(caseRecord)) {
    if (viewer.isComplainant) {
      caseRecord.documents = (caseRecord.documents || []).filter(
        (d) => d.docType !== "RESPONDENT_ANSWER" && d.docType !== "SHOW_CAUSE_ANSWER"
      );
    }
    if (viewer.isRespondent) {
      caseRecord.documents = (caseRecord.documents || []).filter((d) => d.docType !== "COMPLAINT");
      delete caseRecord.description;
      delete caseRecord.isPeerToPeer;
      delete caseRecord.isFirstOffense;
    }
  }

  // One respondent never reads another's filings or their record of answering.
  if (viewer.isRespondent) {
    const mine = userId;
    caseRecord.documents = (caseRecord.documents || []).filter(
      (d) => !isCoRespondentFiling(d, caseRecord, mine)
    );
    caseRecord.respondentAnswers = (caseRecord.respondentAnswers || []).filter(
      (a) => !a.submittedById || a.submittedById === mine || !caseRecord.respondents.some((r) => r.userId === a.submittedById)
    );
  }

  // A document is attached to the case only once the Secretariat approves
  // it. Until then it belongs to whoever filed it — the other party cannot
  // see that it exists, let alone open it (documents.routes.js refuses the
  // download on the same rule).
  if (viewer.isParty) {
    caseRecord.documents = (caseRecord.documents || []).filter((d) =>
      documentAttached(d, userId)
    );
  }

  // Of the show-cause order, a party only ever gets the one that was
  // served: earlier drafts and any the Chairperson returned are internal to
  // CODI, and the returns carry the Chairperson's notes on them.
  if (viewer.isParty) {
    const servedDocIds = new Set(
      (caseRecord.showCauseOrders || [])
        .filter((o) => o.status === "SERVED")
        .map((o) => o.documentId)
        .filter(Boolean)
    );
    caseRecord.documents = (caseRecord.documents || []).filter(
      (d) => d.docType !== "SHOW_CAUSE_ORDER" || servedDocIds.has(d.id)
    );
    caseRecord.showCauseOrders = (caseRecord.showCauseOrders || []).filter(
      (o) => o.status === "SERVED"
    );
  }

  // A respondent is told who else the complaint names, but nothing about them
  // beyond what the complainant wrote: not their account, not whether CODI has
  // matched them. Their own row stays whole.
  if (viewer.isRespondent) {
    const mineRow = respondentRowFor(caseRecord, userId);
    // The Case's own respondent* fields mirror the first respondent. To this
    // respondent they say who THEY are, so older UI code that reads them as
    // "the respondent" is right for each of them.
    if (mineRow) {
      caseRecord.respondentId = mineRow.userId;
      caseRecord.respondentUser = mineRow.user;
      caseRecord.claimedRespondentName = mineRow.claimedName;
      caseRecord.claimedRespondentType = mineRow.claimedType;
      caseRecord.claimedRespondentCollege = mineRow.claimedCollege;
      caseRecord.respondentConfirmedAt = mineRow.confirmedAt;
      caseRecord.respondentAssignedAt = mineRow.assignedAt;
      caseRecord.respondentPathwayChoice = mineRow.pathwayChoice;
      caseRecord.respondentTypeAtFiling = mineRow.typeAtFiling;
      caseRecord.respondentCollegeAtFiling = mineRow.collegeAtFiling;
      caseRecord.governingFramework = frameworkFor(mineRow.typeAtFiling ?? mineRow.claimedType);
    }
    caseRecord.deadlines = (caseRecord.deadlines || []).filter(
      (d) => !d.respondentRowId || d.respondentRowId === mineRow?.id
    );
    // Nor the Committee's finding on anyone else.
    caseRecord.primaFacieEvals = (caseRecord.primaFacieEvals || []).filter(
      (e) => !e.respondentRowId || e.respondentRowId === mineRow?.id
    );
    caseRecord.respondents = (caseRecord.respondents || []).map((r) =>
      r.userId === userId
        ? r
        : {
            id: r.id,
            position: r.position,
            claimedName: r.claimedName,
            claimedType: r.claimedType,
            claimedCollege: r.claimedCollege,
            other: true,
          }
    );
  }
  // Last, so the filters above still compare real ids.
  return maskAnonymousComplainant(caseRecord, userId);
}
