// Who is this user, on this case?
//
// A university member's side — complainant or respondent — belongs to the
// case, not to their account: the same person can file one complaint and
// answer another. Every party check in the API goes through here, so there is
// exactly one answer to that question and the payload filters can't drift
// from the route guards.
//
// The side is deliberately never put in the JWT: it is per-resource, and a
// token that claimed a side would be something to forge.

export const CODI_STAFF = new Set(["SECRETARIAT", "CHAIRPERSON", "COMMITTEE"]);

// The University President. Deliberately outside CODI_STAFF: they are the
// deciding authority, not part of the committee that investigates, and a case
// reaches them only once CODI sends them a drafted formal charge.
export const DISCIPLINING_AUTHORITY = "DISCIPLINING_AUTHORITY";

// What a party files goes to the Secretariat before it joins the case record:
// until it is approved it is visible only to the filer and CODI. CODI's own
// attachments — the signed order, the charge, minutes, reports — are on the
// record as filed, and their own rules decide who may read them (only a
// served show-cause order reaches the parties, for instance).
export const REVIEWABLE_DOC_TYPES = new Set([
  "COMPLAINT",
  "SHOW_CAUSE_ANSWER",
  "RESPONDENT_ANSWER",
  "POSITION_PAPER",
]);

// A document is replaced or withdrawn, never destroyed, so most queries want
// only the live ones. Spread this into any `where` that reads documents for a
// case: without it a superseded version answers "is there one of these?" and
// an archived one locks a slot that should have been freed.
export const CURRENT_DOCUMENTS = { supersededAt: null, archivedAt: null };

export function isCurrentDocument(document) {
  return !document?.supersededAt && !document?.archivedAt;
}

// Is this document on the case record for the given viewer? Evidence and
// CODI's own filings always are; a party's filing only once approved, though
// whoever filed it always sees their own.
//
// Superseded and archived documents are on nobody's record. This is the
// chokepoint the case payload and the download route already share, so the
// check belongs here rather than in each of them — `true` is the default for
// every non-reviewable type, which would otherwise hand parties a withdrawn
// staff document.
export function documentAttached(document, userId) {
  if (!isCurrentDocument(document)) return false;
  if (!REVIEWABLE_DOC_TYPES.has(document?.docType)) return true;
  return document.reviewStatus === "APPROVED" || document.uploadedById === userId;
}

// The case becomes the respondent's when the Secretariat serves the show-cause
// order on them. Until then it is intake: only CODI sees it, the respondent
// has not been told it exists, and it is not in their case list.
//
// This reads a stamped fact rather than the status ladder, so a case that ends
// early — dismissed at intake, say — never lands on a respondent who was
// confirmed but never served.
export function assignedToRespondent(caseRecord) {
  return Boolean(caseRecord?.respondentAssignedAt) || Boolean(caseRecord?.respondents?.some((r) => r.assignedAt));
}

// A case can name up to three respondents (CaseRespondent rows). Callers load
// them with `respondents: true`; one that did not falls back to the first
// respondent mirrored onto the Case itself, which is right for a single one.
function respondentRowsOf(caseRecord) {
  return caseRecord?.respondents?.length ? caseRecord.respondents : null;
}

// Is this user a respondent on the case who has been served?
function servedRespondent(caseRecord, userId) {
  const rows = respondentRowsOf(caseRecord);
  if (rows) return rows.some((r) => r.userId === userId && r.assignedAt);
  return caseRecord.respondentId === userId && assignedToRespondent(caseRecord);
}

// Each respondent answers for themselves: what one files is not another's to
// read, though both can read the complainant's. A respondent's own account
// (userId) is on the row, so "someone else's" is anyone else on the case.
const RESPONDENT_FILING_TYPES = new Set(["SHOW_CAUSE_ANSWER", "RESPONDENT_ANSWER", "POSITION_PAPER", "EVIDENCE"]);

export function isCoRespondentFiling(document, caseRecord, userId) {
  if (!RESPONDENT_FILING_TYPES.has(document?.docType)) return false;
  if (document.uploadedById === userId) return false;
  const rows = respondentRowsOf(caseRecord);
  return Boolean(rows?.some((r) => r.userId === document.uploadedById));
}

// Filings open at that same moment and for the same reason: from service on,
// each side can read what the other files — the complaint and its notarized
// copy, answers, evidence and position papers — so neither is answering
// something they cannot see.
export const documentsShared = assignedToRespondent;

// "COMPLAINANT" | "RESPONDENT" | null. Complainant wins in the impossible case
// of both — filing against yourself is rejected at intake.
export function partySide(caseRecord, userId) {
  if (!caseRecord || !userId) return null;
  if (caseRecord.complainantId === userId) return "COMPLAINANT";
  // Named as the respondent, but the case is only theirs once served: before
  // that they have no side, so every party check here refuses them.
  if (servedRespondent(caseRecord, userId)) return "RESPONDENT";
  return null;
}

// Everything a handler needs to decide what this viewer may see or do.
// isStaff is a positive test against CODI_STAFF — never "not a party", which
// is how a missed case turns into a disclosure.
export function caseViewer(caseRecord, user) {
  const side = partySide(caseRecord, user?.sub);
  const isStaff = CODI_STAFF.has(user?.role);
  // The Authority may open a case only from the point CODI sends them the
  // drafted charge — the same line caseScopeFilter draws for their case list.
  const isAuthority = user?.role === DISCIPLINING_AUTHORITY;
  const chargeSent = isAuthority && (caseRecord?.formalCharges?.length ?? 0) > 0;
  return {
    side,
    isComplainant: side === "COMPLAINANT",
    isRespondent: side === "RESPONDENT",
    isParty: side !== null,
    isStaff,
    isSecretariat: user?.role === "SECRETARIAT",
    isCommittee: user?.role === "COMMITTEE",
    isAuthority,
    canView: side !== null || isStaff || chargeSent,
  };
}

// Which cases this user may list. Staff see everything; a university member
// sees every case they filed, and every case served on them. A case naming
// them as respondent but not yet served is deliberately absent — mirrors
// partySide above.
export function caseScopeFilter(user) {
  if (CODI_STAFF.has(user?.role)) return {};
  // The Authority's caseload is the cases CODI has actually put in front of
  // them: one exists the moment a charge draft is sent.
  if (user?.role === DISCIPLINING_AUTHORITY) return { formalCharges: { some: {} } };
  return {
    OR: [
      { complainantId: user.sub },
      { respondentId: user.sub, respondentAssignedAt: { not: null } },
      { respondents: { some: { userId: user.sub, assignedAt: { not: null } } } },
    ],
  };
}

// Guard for the actions that belong to one side of a case. Sends the response
// and returns false on refusal, matching loadCaseForAccess's shape so handlers
// stay flat: `if (!assertSide(...)) return;`
export function assertSide(caseRecord, user, requiredSide, res) {
  const side = partySide(caseRecord, user?.sub);
  if (side === requiredSide) return true;
  res.status(403).json({
    error:
      requiredSide === "COMPLAINANT"
        ? "Only the complainant on this case can do that."
        : "Only the respondent named in this case can do that.",
  });
  return false;
}
