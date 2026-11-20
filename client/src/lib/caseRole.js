// Which side of a case the signed-in person is on.
//
// An account is not "a complainant" or "a respondent" — a university member
// may have filed one case and been named in another. The server decides the
// side and sends it as `yourSide` on the case payload (null for CODI staff),
// which is also what it used to decide which fields to include. Reading the
// same value here is what keeps the UI from showing a control for data the
// payload doesn't contain.

export const CODI_STAFF_ROLES = new Set(["SECRETARIAT", "CHAIRPERSON", "COMMITTEE"]);

// The University President. Not CODI staff — they decide on what CODI brings
// them, and only see a case once a charge draft has been sent up.
export const isAuthority = (user) => user?.role === "DISCIPLINING_AUTHORITY";

export function viewerOf(caseDetail, user) {
  // Falling back to the foreign keys covers a cached page served before
  // yourSide existed; getting it wrong hides a control rather than revealing
  // something, which is the right way round to fail.
  const side =
    caseDetail?.yourSide ??
    (caseDetail?.complainantId === user?.id
      ? "COMPLAINANT"
      : caseDetail?.respondentId === user?.id
      ? "RESPONDENT"
      : null);
  const isStaff = CODI_STAFF_ROLES.has(user?.role);
  return {
    side,
    isComplainant: side === "COMPLAINANT",
    isRespondent: side === "RESPONDENT",
    isParty: side !== null,
    isStaff,
    isSecretariat: user?.role === "SECRETARIAT",
    isAuthority: isAuthority(user),
  };
}
