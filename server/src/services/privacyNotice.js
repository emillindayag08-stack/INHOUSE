// The privacy notice everyone acknowledges before signing in, and the details
// they give for identification. The client shows the notice and collects the
// details (client/src/lib/privacyNotice.js mirrors these lists); the server
// refuses a sign-in without them and records them on the successful
// LoginAttempt, so every session is documented.
//
// Changing the notice text: bump PRIVACY_NOTICE_VERSION here and in the client.

export const PRIVACY_NOTICE_VERSION = "2026-10-24";

// Whether a sign-in must carry the acknowledgment and details. Switched off
// for now: sign-ins go through without them and record none. Turn it back on
// here and in client/src/lib/privacyNotice.js together.
export const PRIVACY_GATE_ENABLED = false;

export const AFFILIATIONS = {
  STUDENT: "Student",
  FACULTY: "Faculty",
  NON_TEACHING_STAFF: "Non-teaching staff",
  CODI_MEMBER: "CODI member",
  DISCIPLINING_AUTHORITY: "Disciplining Authority",
};

export const PURPOSES = {
  FILE_COMPLAINT: "File a complaint",
  RESPOND_TO_CASE: "Respond to a case",
  FOLLOW_UP: "Follow up on my case",
  CODI_DUTIES: "CODI official duties",
  DECIDE_CASE: "Review or decide on a case",
  OTHER: "Other",
};

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Checks what the sign-in form sent. Returns { ack } or { error }; ack is
// null while the gate is off.
export function readAcknowledgment(body) {
  if (!PRIVACY_GATE_ENABLED) return { ack: null };
  const p = body?.privacy;
  if (!p || p.acknowledged !== true || p.confidentiality !== true) {
    return { error: "Read and acknowledge the privacy notice before signing in." };
  }
  if (p.noticeVersion !== PRIVACY_NOTICE_VERSION) {
    return { error: "The privacy notice has been updated. Reload the page and read it again.", stale: true };
  }
  const fullName = clean(p.fullName, 120);
  const idNumber = clean(p.idNumber, 40).toUpperCase();
  const purposeOther = clean(p.purposeOther, 120);
  if (fullName.length < 2) return { error: "Enter your full name." };
  if (idNumber.length < 3) return { error: "Enter your student or employee number." };
  if (!AFFILIATIONS[p.affiliation]) return { error: "Choose your role or affiliation." };
  if (!PURPOSES[p.purpose]) return { error: "Choose your purpose for signing in." };
  if (p.purpose === "OTHER" && !purposeOther) return { error: "Describe your purpose for signing in." };

  return {
    ack: {
      noticeVersion: PRIVACY_NOTICE_VERSION,
      fullName,
      idNumber,
      affiliation: p.affiliation,
      purpose: p.purpose,
      ...(p.purpose === "OTHER" && { purposeOther }),
      acknowledgedAt: new Date().toISOString(),
    },
  };
}

// University members are in the directory, so the number they typed must be
// theirs. CODI staff accounts are appointments with no directory number: what
// they typed is recorded as given (idMatches null).
export function checkIdentity(ack, user) {
  if (!ack) return null;
  if (!user.directoryId) return { ...ack, idMatches: null };
  const matches = ack.idNumber === String(user.directoryId).trim().toUpperCase();
  return { ...ack, idMatches: matches };
}
