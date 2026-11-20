// Records retention.
//
// A file is eligible for disposal only once it has been kept for at least
// RETENTION_YEARS, counted from the day its case closed. A case that is still
// open — or was never closed — has files that are never eligible. Nothing here
// deletes anything: eligibility only raises a flag, and disposal itself is the
// Secretariat's explicit, audited approval (POST /records/:docId/disposal).
//
// Cases do not store a close date, so the date the case last changed stands in
// for it. That errs the safe way: any later change to a closed case pushes
// eligibility back, never forward.

// A floor, not a setting: the period cannot be shortened by configuration.
export const RETENTION_YEARS = 5;

export const CLOSED_CASE_STATUSES = ["DISMISSED", "RESOLVED", "ESCALATED"];

function addYears(date, years) {
  const out = new Date(date);
  out.setFullYear(out.getFullYear() + years);
  return out;
}

// The date a case's files become eligible, or null while the case is open.
export function eligibleOn(caseRecord) {
  if (!caseRecord || !CLOSED_CASE_STATUSES.includes(caseRecord.status)) return null;
  return addYears(caseRecord.updatedAt, RETENTION_YEARS);
}

// Prisma filter for "files whose case has been closed long enough".
export function eligibleCaseWhere(now = new Date()) {
  return { status: { in: CLOSED_CASE_STATUSES }, updatedAt: { lte: addYears(now, -RETENTION_YEARS) } };
}

// What the Records page needs to show about one file.
export function retentionInfo(document, now = new Date()) {
  const due = eligibleOn(document.case);
  const disposed = Boolean(document.disposalApprovedAt);
  return {
    eligibleOn: due,
    eligibleForDisposal: !disposed && due !== null && due <= now,
    disposed,
  };
}
