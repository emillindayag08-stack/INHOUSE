import { prisma } from "../prismaClient.js";
import { caseLabel } from "../utils/caseLabel.js";

// Keeps anonymous filing from being used to flood CODI. Every filer is signed
// in, so the limits are per account; nobody on the case learns who it is.
//
// The figures below are the whole policy. Change them here.
export const ANONYMOUS_LIMITS = {
  openMax: 2, // anonymous complaints still open at once
  windowDays: 30,
  windowMax: 3, // anonymous complaints filed within windowDays
  cooldownHours: 24, // between two anonymous filings
  strikeDays: 90,
  strikeMax: 3, // "not entertained" within strikeDays before a pause
  pauseDays: 60, // how long anonymous filing is paused after that
  descriptionMin: 100, // characters an anonymous description needs
  relatedDays: 30, // how far back another filer's report counts as related
};

export const ANONYMOUS_GROUNDS = new Set(["PUBLIC_KNOWLEDGE", "VERIFIABLE", "DOCUMENTARY_EVIDENCE", "AGENCY_REFERRAL"]);

const CLOSED = ["DISMISSED", "RESOLVED", "ESCALATED"];
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const dateText = (d) =>
  d.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

// Whether this account may file an anonymous complaint now.
// Returns { allowed: true } or { allowed: false, reason, until }.
export async function anonymousAllowance(userId, now = new Date()) {
  const L = ANONYMOUS_LIMITS;
  const mine = await prisma.case.findMany({
    where: { complainantId: userId, isAnonymous: true },
    select: { status: true, filedAt: true, notEntertainedAt: true },
    orderBy: { filedAt: "desc" },
  });

  // Repeatedly not entertained: paused, checked first because it outlasts the rest.
  const strikes = mine
    .map((c) => c.notEntertainedAt)
    .filter(Boolean)
    .sort((a, b) => b - a);
  if (strikes.length >= L.strikeMax) {
    const latest = strikes[0];
    const inWindow = strikes.filter((s) => latest - s <= L.strikeDays * DAY).length;
    const until = new Date(latest.getTime() + L.pauseDays * DAY);
    if (inWindow >= L.strikeMax && now < until) {
      return {
        allowed: false,
        until,
        reason: `Anonymous filing is paused for your account until ${dateText(until)}, because ${L.strikeMax} of your anonymous complaints were not entertained within ${L.strikeDays} days. You can still file under your name.`,
      };
    }
  }

  const open = mine.filter((c) => !CLOSED.includes(c.status)).length;
  if (open >= L.openMax) {
    return {
      allowed: false,
      until: null,
      reason: `You already have ${open} anonymous complaints in progress, the most allowed at once. You can file another when one of them closes, or file under your name.`,
    };
  }

  const recent = mine.filter((c) => now - c.filedAt < L.windowDays * DAY);
  if (recent.length >= L.windowMax) {
    const until = new Date(recent[recent.length - 1].filedAt.getTime() + L.windowDays * DAY);
    return {
      allowed: false,
      until,
      reason: `You've filed ${recent.length} anonymous complaints in the last ${L.windowDays} days, the most allowed. You can file another anonymously from ${dateText(until)}, or file under your name now.`,
    };
  }

  const last = mine[0];
  if (last && now - last.filedAt < L.cooldownHours * HOUR) {
    const until = new Date(last.filedAt.getTime() + L.cooldownHours * HOUR);
    return {
      allowed: false,
      until,
      reason: `Please wait ${L.cooldownHours} hours between anonymous complaints. You can file another anonymously from ${dateText(until)}.`,
    };
  }

  return { allowed: true };
}

// Checks the parts of an anonymous complaint that make it screenable under
// Section 12. Returns { fields } ready to store, or { error }.
export function readAnonymousDetails(body, evidenceLinkCount, now = new Date()) {
  const L = ANONYMOUS_LIMITS;
  // One or more conditions; any one is enough, but the filer may claim several.
  const grounds = [...new Set(Array.isArray(body.anonymousGrounds) ? body.anonymousGrounds : [])];
  if (grounds.length === 0) {
    return { error: "Choose at least one Section 12 condition your complaint meets." };
  }
  if (grounds.some((g) => !ANONYMOUS_GROUNDS.has(g))) {
    return { error: "One of the Section 12 conditions you chose isn't recognized." };
  }
  if (grounds.includes("DOCUMENTARY_EVIDENCE") && evidenceLinkCount === 0) {
    return { error: "You chose \"You have strong evidence\". Add at least one evidence link." };
  }
  if (String(body.description ?? "").trim().length < L.descriptionMin) {
    return { error: `Describe the incident in at least ${L.descriptionMin} characters, so CODI can check it.` };
  }
  const incidentDate = body.incidentDate ? new Date(body.incidentDate) : null;
  if (!incidentDate || Number.isNaN(incidentDate.getTime())) {
    return { error: "Give the date the incident happened." };
  }
  if (incidentDate > now) return { error: "The date of the incident can't be in the future." };
  const incidentPlace = String(body.incidentPlace ?? "").replace(/\s+/g, " ").trim();
  if (incidentPlace.length < 3) return { error: "Say where the incident happened." };
  if (incidentPlace.length > 200) return { error: "Keep the place of the incident to 200 characters." };
  if (body.falseComplaintAck !== true) {
    return { error: "Confirm the declaration that your complaint is truthful before sending it." };
  }
  return {
    // Stored in the order Section 12 lists them, whatever order they were ticked.
    fields: {
      anonymousGrounds: [...ANONYMOUS_GROUNDS].filter((g) => grounds.includes(g)),
      incidentDate,
      incidentPlace,
      falseComplaintAckAt: now,
    },
  };
}

// Lowercase words in sorted order, so "Dolorain, Bregil" and "Bregil
// Dolorain" read as the same name.
const normalName = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");

// Whether a respondent row and a respondent being filed are the same person:
// the same directory account, or the same name as written.
function samePerson(row, r) {
  if (row.userId && r.user?.id && row.userId === r.user.id) return true;
  const a = normalName(row.claimedName);
  return a.length > 0 && a === normalName(r.name);
}

// The same account filing again against someone it already has an open
// complaint against. Applies to every complaint, named or anonymous.
export async function duplicateOpenComplaint(userId, respondents) {
  const open = await prisma.case.findMany({
    where: { complainantId: userId, status: { notIn: CLOSED } },
    select: { referenceNumber: true, cpiNumber: true, caseNumber: true, respondents: true },
  });
  for (const c of open) {
    const match = respondents.find((r) => c.respondents.some((row) => samePerson(row, r)));
    if (match) {
      return `You already have an open complaint (${caseLabel(c)}) against ${match.name}. Add to that one instead of filing again.`;
    }
  }
  return null;
}

// Open cases from other filers naming the same respondent recently. Shown to
// the Secretariat as related reports, never used to block a filing: several
// people reporting the same person is often the strongest signal there is.
export async function relatedReports(caseRecord) {
  const since = new Date(caseRecord.filedAt.getTime() - ANONYMOUS_LIMITS.relatedDays * DAY);
  const others = await prisma.case.findMany({
    where: {
      id: { not: caseRecord.id },
      complainantId: { not: caseRecord.complainantId },
      status: { notIn: CLOSED },
      filedAt: { gte: since },
    },
    select: { id: true, referenceNumber: true, cpiNumber: true, caseNumber: true, status: true, isAnonymous: true, respondents: true },
  });
  const mine = caseRecord.respondents.map((row) => ({ user: row.userId ? { id: row.userId } : null, name: row.claimedName }));
  return others
    .filter((c) => c.respondents.some((row) => mine.some((r) => samePerson(row, r))))
    .map((c) => ({ id: c.id, label: caseLabel(c), status: c.status, isAnonymous: c.isAnonymous }));
}

// How many of this filer's other anonymous complaints were not entertained in
// the last strikeDays: a count for the Secretariat, never a name.
export async function filerStrikeCount(caseRecord, now = new Date()) {
  return prisma.case.count({
    where: {
      id: { not: caseRecord.id },
      complainantId: caseRecord.complainantId,
      isAnonymous: true,
      notEntertainedAt: { gte: new Date(now.getTime() - ANONYMOUS_LIMITS.strikeDays * DAY) },
    },
  });
}
