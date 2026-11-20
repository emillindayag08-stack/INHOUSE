// A complaint names one to three respondents, and each is voted on and scored
// separately. These helpers give the prima facie and risk-assessment screens a
// view of the case as it concerns ONE respondent.

// Votes, scores and findings recorded before they named a respondent are the
// first respondent's.
export const belongsToRow = (record, row) =>
  record.respondentRowId ? record.respondentRowId === row.id : row.position === 0;

// The respondents the case is still proceeding against, as the viewer can see
// them. A respondent's own payload marks everyone else `other` (names only).
export const visibleRespondentRows = (caseDetail) => (caseDetail.respondents || []).filter((r) => !r.other);

export const respondentLabel = (row) => row.user?.fullName || row.claimedName;

// The case, narrowed to one respondent: their votes, risk assessments, finding
// and offense level — so components written for one respondent work unchanged.
// With no row (a case loaded without respondent rows) the case is returned as is.
export function respondentView(caseDetail, row) {
  if (!row) return caseDetail;
  return {
    ...caseDetail,
    primaFacieVotes: (caseDetail.primaFacieVotes || []).filter((v) => belongsToRow(v, row)),
    riskAssessments: (caseDetail.riskAssessments || []).filter((a) => belongsToRow(a, row)),
    primaFacieEvals: (caseDetail.primaFacieEvals || []).filter((e) => belongsToRow(e, row)),
    offenseClassification: row.offenseClassification ?? null,
    respondentRow: row,
  };
}
