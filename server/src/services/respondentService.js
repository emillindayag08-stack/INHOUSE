import { prisma } from "../prismaClient.js";
import { notify } from "./auditService.js";
import { RESPONDENT_NAME_MAX } from "../utils/limits.js";
import { getPersonById, resolveUserByDirectoryId } from "./directory/index.js";
import { CURRENT_DOCUMENTS } from "./caseAccess.js";
import { caseLabel } from "../utils/caseLabel.js";
import { ensureDeadline } from "./deadlineService.js";

// A complaint names one to three respondents. Each is a CaseRespondent row;
// the first (position 0) is mirrored onto the Case's own respondent* columns,
// which older code still reads — see syncPrimaryRespondent.
export const MAX_RESPONDENTS = 3;

// Which rules govern a respondent, from their status.
export const frameworkFor = (type) => (type === "STUDENT" ? "GBSH_CODE" : "RACCS");

// --- Reading the list from a request ----------------------------------------
// Accepts { respondents: [{ id?, name, type, college, directoryId? }] }, or the
// older flat fields (claimedRespondentName/Type/College, respondentDirectoryId)
// as a list of one. Returns { list } or { error }. The identity of anyone
// picked from the directory comes from the directory, never from the client.
export async function parseRespondents(body, complainantId) {
  const raw = Array.isArray(body.respondents)
    ? body.respondents
    : [
        {
          name: body.claimedRespondentName,
          type: body.claimedRespondentType,
          college: body.claimedRespondentCollege,
          directoryId: body.respondentDirectoryId,
        },
      ];

  if (raw.length < 1 || raw.length > MAX_RESPONDENTS) {
    return { error: `A complaint can name between 1 and ${MAX_RESPONDENTS} respondents.` };
  }

  const list = [];
  const seenDirectory = new Set();
  const seenNames = new Set();
  for (const [i, entry] of raw.entries()) {
    const label = raw.length > 1 ? `Respondent ${i + 1}: ` : "";
    const name = String(entry?.name ?? "").trim();
    const college = String(entry?.college ?? "").trim();
    const type = entry?.type;
    if (!name || !college) {
      return { error: `${label}The respondent's name and college are required.` };
    }
    if (name.length > RESPONDENT_NAME_MAX) {
      return { error: `${label}The respondent's name can be at most ${RESPONDENT_NAME_MAX} characters.` };
    }
    if (!["STUDENT", "PERSONNEL"].includes(type)) {
      return { error: `${label}Say whether the respondent is a student or personnel.` };
    }
    const nameKey = `${name.toLowerCase()}|${college.toLowerCase()}`;
    if (seenNames.has(nameKey)) {
      return { error: `${label}This respondent is listed twice.` };
    }
    seenNames.add(nameKey);

    const item = { id: entry?.id || null, name, college, type, directoryId: null, person: null, user: null };

    const directoryId = entry?.directoryId || null;
    if (directoryId) {
      if (seenDirectory.has(directoryId)) {
        return { error: `${label}This person is listed twice.` };
      }
      seenDirectory.add(directoryId);
      const person = getPersonById(directoryId);
      const user = person ? await resolveUserByDirectoryId(directoryId) : null;
      if (!person || !user) {
        return { error: `${label}That person is not in the BulSU directory.` };
      }
      if (user.id === complainantId) {
        return { error: "You cannot file a complaint against yourself." };
      }
      if (user.role !== "PARTY") {
        return { error: "CODI officials cannot be named as the respondent here." };
      }
      // The directory settles what they are and where they belong: the status
      // picks the rulebook and the college is what the reports group by.
      if (person.type && person.type !== type) {
        return {
          error: `${label}${person.fullName} is ${person.type === "STUDENT" ? "a student" : "personnel"} in the BulSU directory, but the complaint says ${type === "STUDENT" ? "student" : "personnel"}. The status must match the person named.`,
        };
      }
      if (person.college && person.college !== college) {
        return {
          error: `${label}${person.fullName} is in ${person.college} in the BulSU directory, but the complaint says ${college}. The college must match the person named.`,
        };
      }
      item.directoryId = directoryId;
      item.person = person;
      item.user = user;
    }
    list.push(item);
  }
  return { list };
}

// --- The primary-respondent mirror ------------------------------------------
// Copies the first respondent onto the Case columns the rest of the code reads.
// Call inside the same transaction as any write to a CaseRespondent. The Case
// is "assigned" from the first moment any respondent was served.
export async function syncPrimaryRespondent(db, caseId) {
  const rows = await db.caseRespondent.findMany({ where: { caseId }, orderBy: { position: "asc" } });
  const primary = rows[0];
  if (!primary) return null;
  const served = rows.map((r) => r.assignedAt).filter(Boolean).sort((a, b) => a - b);
  return db.case.update({
    where: { id: caseId },
    data: {
      respondentId: primary.userId,
      claimedRespondentName: primary.claimedName,
      claimedRespondentType: primary.claimedType,
      claimedRespondentCollege: primary.claimedCollege,
      respondentConfirmedAt: primary.confirmedAt,
      respondentConfirmedById: primary.confirmedById,
      respondentTypeAtFiling: primary.typeAtFiling,
      respondentCollegeAtFiling: primary.collegeAtFiling,
      respondentAssignedAt: served[0] ?? null,
      respondentPathwayChoice: primary.pathwayChoice,
      governingFramework: frameworkFor(primary.typeAtFiling ?? primary.claimedType),
    },
  });
}

// --- Lookups on a loaded case (needs `respondents` included) ----------------
export function respondentRows(caseRecord) {
  return [...(caseRecord.respondents || [])].sort((a, b) => a.position - b.position);
}

// The row of the respondent this user is, once served. Null for anyone else.
export function respondentRowFor(caseRecord, userId) {
  return respondentRows(caseRecord).find((r) => r.userId === userId && r.assignedAt) || null;
}

// Every respondent who has an account (so can be told something).
export function respondentUserIds(caseRecord, { servedOnly = false, includeCleared = false } = {}) {
  const ids = respondentRows(caseRecord)
    // A respondent the Committee found no prima facie case against is out of
    // everything after that, unless the message is for everyone served.
    .filter((r) => r.userId && (!servedOnly || r.assignedAt) && (includeCleared || r.primaFacieFound !== false))
    .map((r) => r.userId);
  // Cases loaded without rows fall back to the mirrored primary.
  if (ids.length === 0 && caseRecord.respondentId && (!servedOnly || caseRecord.respondentAssignedAt)) {
    return [caseRecord.respondentId];
  }
  return [...new Set(ids)];
}

// "Name" or "Name and 2 others", for messages and lists.
export function respondentNames(caseRecord) {
  const rows = respondentRows(caseRecord);
  if (rows.length === 0) return caseRecord.claimedRespondentName || "the respondent";
  const names = rows.map((r) => r.claimedName);
  return names.length === 1 ? names[0] : `${names[0]} and ${names.length - 1} other${names.length > 2 ? "s" : ""}`;
}

// The same message to every respondent who can be reached.
export async function notifyRespondents(caseRecord, message, options) {
  for (const userId of respondentUserIds(caseRecord, options)) {
    await notify({ userId, caseId: caseRecord.id, message });
  }
}

// Loads a case's respondent rows when the caller didn't.
export function loadRespondents(caseId) {
  return prisma.caseRespondent.findMany({ where: { caseId }, orderBy: { position: "asc" } });
}

// --- Where the show-cause stage stands across all respondents ----------------
// Each served respondent answers separately. The case waits at SHOW_CAUSE_ISSUED
// until every one has either filed a response or been recorded by the
// Secretariat as not responding (a lapsed window); it then waits for the
// Secretariat to approve each filed response.
//   allFiled   - every served respondent has an answer record
//   allSettled - every served respondent's response is approved, or was a lapse
export async function showCauseProgress(db, caseId) {
  const [rows, docs, answers] = await Promise.all([
    db.caseRespondent.findMany({ where: { caseId, assignedAt: { not: null } }, orderBy: { position: "asc" } }),
    db.document.findMany({ where: { caseId, docType: "SHOW_CAUSE_ANSWER", ...CURRENT_DOCUMENTS } }),
    db.respondentAnswer.findMany({ where: { caseId, stage: "SHOW_CAUSE" } }),
  ]);
  const per = rows.map((row) => {
    const mine = answers.filter((a) => a.respondentRowId === row.id);
    const lapsed = mine.some((a) => a.content);
    const approved = docs.some((d) => d.respondentRowId === row.id && d.reviewStatus === "APPROVED");
    return { row, filed: mine.length > 0, lapsed, approved };
  });
  return {
    rows,
    per,
    allFiled: per.length > 0 && per.every((p) => p.filed),
    allSettled: per.length > 0 && per.every((p) => p.approved || p.lapsed),
  };
}

// --- Several respondents: every notarized document is approved first ---------
// With more than one respondent, the case does not move past a stage until each
// respondent's notarized filing for it has been approved by the Secretariat.
// Returns the names of those still without an approved one (empty = all in).
// A single-respondent case is not held to this.
export async function respondentsAwaitingApproval(db, caseId, docType) {
  const rows = (
    await db.caseRespondent.findMany({
      where: { caseId, assignedAt: { not: null } },
      orderBy: { position: "asc" },
    })
  ).filter(isActiveRespondent);
  if (rows.length <= 1) return [];
  const docs = await db.document.findMany({
    where: { caseId, docType, reviewStatus: "APPROVED", ...CURRENT_DOCUMENTS },
    select: { uploadedById: true },
  });
  return rows.filter((r) => !docs.some((d) => d.uploadedById === r.userId)).map((r) => r.claimedName);
}

// The Secretariat sets the pathway once the complainant and every respondent
// have chosen — and, with several respondents, every formal answer is approved.
// Called when a choice is made and again when an answer is approved.
export async function notifyPathwayReady(caseRecord) {
  if (caseRecord.isAnonymous) return startAnonymousPositionPapers(caseRecord);
  const rows = activeRespondentRows(caseRecord).filter((r) => r.assignedAt);
  const choices = rows.map((r) => r.pathwayChoice);
  if (choices.length === 0 || choices.some((c) => !c) || !caseRecord.complainantPathwayChoice) return;
  if (caseRecord.finalPathway) return;
  if ((await respondentsAwaitingApproval(prisma, caseRecord.id, "RESPONDENT_ANSWER")).length > 0) return;
  const agreed = choices.every((c) => c === caseRecord.complainantPathwayChoice);
  const secretariat = await prisma.user.findMany({ where: { role: "SECRETARIAT" }, select: { id: true } });
  for (const member of secretariat) {
    await notify({
      userId: member.id,
      caseId: caseRecord.id,
      message: agreed
        ? `Case ${caseLabel(caseRecord)}: ${rows.length > 1 ? "everyone" : "both parties"} asked for ${caseRecord.complainantPathwayChoice.replace(/_/g, " ").toLowerCase()}. Set the pathway the case will proceed under.`
        : `Case ${caseLabel(caseRecord)}: the parties asked for different pathways. Set the one the case will proceed under.`,
    });
  }
}

// An anonymous case's only proceeding is the respondent's position paper. Once
// every respondent's answer to the charge is approved, the case moves straight
// onto that pathway: a paper is owed by each respondent, none by the
// complainant, and there are no hearings.
export async function startAnonymousPositionPapers(caseRecord) {
  if (caseRecord.finalPathway) return;
  const rows = activeRespondentRows(caseRecord).filter((r) => r.assignedAt);
  if (rows.length === 0) return;
  // Every respondent's answer is in and approved as notarized.
  const answered = await prisma.respondentAnswer.findMany({
    where: { caseId: caseRecord.id, stage: "FORMAL_CHARGE" },
    select: { respondentRowId: true },
  });
  const approvedAnswers = await prisma.document.findMany({
    where: { caseId: caseRecord.id, docType: "RESPONDENT_ANSWER", reviewStatus: "APPROVED", ...CURRENT_DOCUMENTS },
    select: { uploadedById: true },
  });
  const ready = rows.every(
    (r) => answered.some((a) => belongsToRow(a, r)) && approvedAnswers.some((d) => d.uploadedById === r.userId)
  );
  if (!ready) return;

  await prisma.case.update({
    where: { id: caseRecord.id },
    data: { finalPathway: "POSITION_PAPER", pathwayRecommendedAt: new Date() },
  });
  const now = new Date();
  for (const row of rows) {
    await ensureDeadline(caseRecord.id, "POSITION_PAPER", now, frameworkFor(row.typeAtFiling ?? row.claimedType), row.id);
  }
  await notifyRespondents(
    caseRecord,
    `Case ${caseLabel(caseRecord)} proceeds by position paper. Upload your notarized position paper from the case page.`
  );
  const secretariat = await prisma.user.findMany({ where: { role: "SECRETARIAT" }, select: { id: true } });
  for (const member of secretariat) {
    await notify({
      userId: member.id,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)} (anonymous): the answer is approved, so the case now proceeds by the respondent's position paper.`,
    });
  }
}

// --- Per-respondent prima facie ----------------------------------------------
// With several respondents each one gets their own Committee vote, finding and
// risk assessment. A respondent the Secretariat finds NO prima facie case
// against drops out of everything after that stage; the case goes on for the
// rest. `primaFacieFound` is null until their finding is confirmed.
export const isActiveRespondent = (row) => row.primaFacieFound !== false;

// The respondents the case is still proceeding against.
export function activeRespondentRows(caseRecord) {
  return respondentRows(caseRecord).filter(isActiveRespondent);
}

// Rows from before a vote or score named its respondent are the first
// respondent's, so a null respondentRowId belongs to position 0.
export function belongsToRow(record, row) {
  return record.respondentRowId ? record.respondentRowId === row.id : row.position === 0;
}

// Which respondent a request is about: the one it names, or — for a case with
// a single respondent, as every older client sends it — that one. Null when it
// is ambiguous or names someone not on the case.
export function respondentRowForRequest(caseRecord, requestedId) {
  const rows = respondentRows(caseRecord);
  if (requestedId) return rows.find((r) => r.id === requestedId) || null;
  return rows.length === 1 ? rows[0] : null;
}

// The case's own offense level mirrors one respondent: the first the case is
// proceeding against with a level on record, else the first with any.
export async function syncCaseClassification(db, caseId) {
  const rows = await db.caseRespondent.findMany({ where: { caseId }, orderBy: { position: "asc" } });
  const pick =
    rows.find((r) => r.primaFacieFound === true && r.offenseClassification) ||
    rows.find((r) => r.offenseClassification) ||
    null;
  await db.case.update({ where: { id: caseId }, data: { offenseClassification: pick?.offenseClassification ?? null } });
}
