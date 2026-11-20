// The privacy notice shown before every sign-in, and the details collected for
// identification. Mirrors server/src/services/privacyNotice.js: the server
// refuses a sign-in whose notice version or choices don't match.
//
// Changing the notice text: bump PRIVACY_NOTICE_VERSION here and on the server.

export const PRIVACY_NOTICE_VERSION = "2026-10-24";

// Whether sign-in starts with the notice (step 1) and the details (step 2).
// Switched off for now: sign-in goes straight to email and password. Turn it
// back on here and in server/src/services/privacyNotice.js together.
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

export const NOTICE_SECTIONS = [
  {
    title: "Who we are",
    body: [
      "The CODI Information System (CODI-IS) is operated by the Committee on Decorum and Investigation (CODI) of Bulacan State University. It handles complaints of gender-based sexual harassment (GBSH) and related misconduct under the BulSU Anti-GBSH Code, the Safe Spaces Act (RA 11313) and the 2025 Rules on Administrative Cases in the Civil Service (RACCS).",
    ],
  },
  {
    title: "What we collect",
    list: [
      "Your identity: name, student or employee number, college or office, role, and university email.",
      "What you give us before signing in: your affiliation and purpose of access.",
      "Case information: complaints, answers, evidence, statements, hearing records, findings and decisions.",
      "Sign-in and activity records: date and time, IP address, browser, and the actions you take in the system.",
    ],
  },
  {
    title: "Why we collect it",
    list: [
      "To identify you and confirm you may access the system and the cases you are part of.",
      "To receive, investigate and decide complaints fairly and within the required periods.",
      "To send notices, reminders and sign-in codes to your university email.",
      "To keep an accurate, auditable record of every case and of who accessed it, as the law and university rules require.",
    ],
  },
  {
    title: "Who can see it",
    body: [
      "Only those with an official role in a case: the CODI Secretariat, Chairperson and Committee members, the Disciplining Authority once a case reaches them, and the parties for their own case, each limited to what they need. Information is not shared outside the university except where the law requires it.",
    ],
  },
  {
    title: "How long we keep it",
    body: [
      "Case records are kept for at least five (5) years after a case is closed, then disposed of only with the Secretariat's documented approval. Sign-in records are kept as part of the system's audit trail.",
    ],
  },
  {
    title: "Your rights",
    body: [
      "Under the Data Privacy Act of 2012 (RA 10173) you may ask to be informed, to access and correct your personal data, and to object to or question how it is processed. You may raise privacy concerns with the CODI Secretariat or the BulSU Data Protection Officer, or file a complaint with the National Privacy Commission.",
    ],
  },
];

export const CONFIDENTIALITY_REMINDERS = [
  "Everything in CODI-IS is confidential. Use it only for your official role or your own case.",
  "Do not share, copy, screenshot, download, print or forward case information except as your role requires.",
  "Never reveal the identity of a complainant, respondent or witness to anyone not involved in the case.",
  "Keep your password and sign-in codes to yourself, and sign out when you finish, especially on shared computers.",
  "Report any unauthorized access or disclosure to the CODI Secretariat at once.",
  "Breaching confidentiality may lead to disciplinary action and to liability under RA 10173 and RA 11313.",
];
