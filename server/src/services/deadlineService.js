import { prisma } from "../prismaClient.js";
import { notify } from "./auditService.js";
import { caseLabel } from "../utils/caseLabel.js";

// The periods the two rulebooks set, and where each one starts here.
//
//   Step                   GBSH Code (students)            RACCS 2025 (personnel)
//   Respondent's response  5 days (Sec. 15d)               5 days (Sec. 22a)
//                          from service of the show-cause order
//   Report to the          30 days from the response       5 days after the preliminary
//   President              (Sec. 15), from the accepted    investigation (Sec. 24), from the
//                          response                        prima facie finding
//   Formal charge          15 days from the CODI report    no fixed period (Sec. 26)
//                          (Sec. 16), to the signed charge
//   Answer to the charge   7 days (Sec. 19d)               3 to 10 days (Sec. 26b): the 10
//                          from the charge being issued
//   Position papers        2 weeks (Sec. 19f)              10 days (Sec. 41)
//                          from the pathway being set, one per party
//   Decision               30 days (Sec. 19i, 19k)         30 days (Sec. 57)
//                          from the report/recommendation reaching the President
//
// NOTARIZED_COMPLAINT is an institutional intake rule, not from either code: the
// complainant has 3 days from filing to submit the notarized copy.
// A stage missing from a framework's table has no deadline there.
const GBSH_STAGE_DAYS = {
  NOTARIZED_COMPLAINT: 3,
  RESPONDENT_RESPONSE: 5,
  REPORT_TO_PRESIDENT: 30,
  FORMAL_CHARGE: 15,
  ANSWER_TO_CHARGE: 7,
  POSITION_PAPER: 14,
  POSITION_PAPER_COMPLAINANT: 14,
  PRESIDENT_DECISION: 30,
};

const RACCS_STAGE_DAYS = {
  NOTARIZED_COMPLAINT: 3,
  RESPONDENT_RESPONSE: 5,
  REPORT_TO_PRESIDENT: 5,
  // FORMAL_CHARGE: no fixed period under RACCS (Sec. 26)
  ANSWER_TO_CHARGE: 10,
  POSITION_PAPER: 10,
  POSITION_PAPER_COMPLAINANT: 10,
  PRESIDENT_DECISION: 30,
};

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// respondentRowId is for a deadline that belongs to one respondent when a case
// names several (see CaseRespondent); omit it for the case as a whole.
export async function createDeadline(caseId, stage, fromDate, framework, respondentRowId = null) {
  const table = framework === "GBSH_CODE" ? GBSH_STAGE_DAYS : RACCS_STAGE_DAYS;
  const days = table[stage];
  if (!days) return null;
  return prisma.deadline.create({
    data: {
      caseId,
      stage: stage.replace(/_/g, " "),
      dueAt: addDays(fromDate, days),
      respondentRowId,
    },
  });
}

export async function markDeadlineMet(caseId, stagePrefix, respondentRowId = null) {
  const deadline = await prisma.deadline.findFirst({
    where: {
      caseId,
      stage: { contains: stagePrefix, mode: "insensitive" },
      status: "PENDING",
      ...(respondentRowId ? { respondentRowId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!deadline) return null;
  return prisma.deadline.update({
    where: { id: deadline.id },
    data: { status: "MET", completedAt: new Date() },
  });
}

// Sweeps pending deadlines and flags overdue ones. Called on-demand from the
// list/dashboard endpoints rather than a cron job, since this is a draft
// without a background job runner yet. A deadline transitions to OVERDUE
// exactly once, so the lapse notifications below cannot duplicate.
// Like createDeadline, but never a second one for the same stage and party: the
// events that start a clock can happen more than once (a charge returned and
// sent again, a response re-filed).
export async function ensureDeadline(caseId, stage, fromDate, framework, respondentRowId = null) {
  const existing = await prisma.deadline.findFirst({
    where: { caseId, stage: stage.replace(/_/g, " "), respondentRowId },
  });
  return existing || createDeadline(caseId, stage, fromDate, framework, respondentRowId);
}

// The clock on the report to the President. It starts at a different moment under
// each rulebook: under the GBSH Code, when the respondent's response is accepted
// (trigger "RESPONSE"); under RACCS, when the preliminary investigation ends,
// which here is the prima facie finding (trigger "PRIMA_FACIE").
export async function startReportClock(caseRecord, trigger) {
  const gbsh = caseRecord.governingFramework === "GBSH_CODE";
  if ((gbsh && trigger !== "RESPONSE") || (!gbsh && trigger !== "PRIMA_FACIE")) return null;
  return ensureDeadline(caseRecord.id, "REPORT_TO_PRESIDENT", new Date(), caseRecord.governingFramework);
}

// Display names of the respondent rows behind some deadlines, by row id.
async function respondentNamesById(ids) {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return new Map();
  const rows = await prisma.caseRespondent.findMany({
    where: { id: { in: wanted } },
    select: { id: true, claimedName: true },
  });
  return new Map(rows.map((r) => [r.id, r.claimedName]));
}

export async function sweepOverdueDeadlines() {
  const lapsed = await prisma.deadline.findMany({
    where: { status: "PENDING", dueAt: { lt: new Date() } },
    include: { case: { select: { id: true, caseNumber: true, cpiNumber: true, referenceNumber: true, complainantId: true } } },
  });
  if (lapsed.length === 0) return { count: 0 };

  await prisma.deadline.updateMany({
    where: { id: { in: lapsed.map((d) => d.id) } },
    data: { status: "OVERDUE" },
  });

  // The 3-day notarized-complaint window is the one lapse that triggers a
  // human decision (Committee may dismiss for non-compliance), so notify the
  // complainant and every Committee member when it passes.
  const notarization = lapsed.filter((d) => d.stage.includes("NOTARIZED COMPLAINT"));
  if (notarization.length > 0) {
    const committee = await prisma.user.findMany({
      where: { role: "COMMITTEE", deactivatedAt: null },
      select: { id: true },
    });
    for (const deadline of notarization) {
      await notify({
        userId: deadline.case.complainantId,
        caseId: deadline.case.id,
        message: `The 3-day window to submit your notarized complaint for case ${caseLabel(deadline.case)} has lapsed. The Committee may dismiss the case for non-compliance.`,
      });
      for (const member of committee) {
        await notify({
          userId: member.id,
          caseId: deadline.case.id,
          message: `Case ${caseLabel(deadline.case)}: the complainant's 3-day notarized-complaint window has lapsed without a notarized document. You may dismiss the case for non-compliance.`,
        });
      }
    }
  }

  // The respondent's response window lapsing is the other lapse that
  // triggers a human decision — the Secretariat may proceed with the case
  // based on the available records (see POST /:id/proceed-without-response).
  const respondentResponse = lapsed.filter((d) => d.stage.includes("RESPONDENT RESPONSE"));
  if (respondentResponse.length > 0) {
    const secretariat = await prisma.user.findMany({
      where: { role: "SECRETARIAT" },
      select: { id: true },
    });
    const rowNames = await respondentNamesById(respondentResponse.map((d) => d.respondentRowId));
    for (const deadline of respondentResponse) {
      const who = rowNames.get(deadline.respondentRowId);
      for (const member of secretariat) {
        await notify({
          userId: member.id,
          caseId: deadline.case.id,
          message: `Case ${caseLabel(deadline.case)}: ${who ? `${who}'s` : "the respondent's"} 5-day window to answer the show-cause order has lapsed. You may proceed with the case based on the available records.`,
        });
      }
    }
  }

  // The later stages have no one to decide anything when they lapse, but the
  // Secretariat runs the case, so they are told which one has passed.
  const watched = lapsed.filter((d) =>
    ["REPORT TO PRESIDENT", "FORMAL CHARGE", "ANSWER TO CHARGE", "POSITION PAPER", "PRESIDENT DECISION"].some((k) =>
      d.stage.includes(k)
    )
  );
  if (watched.length > 0) {
    const secretariat = await prisma.user.findMany({ where: { role: "SECRETARIAT" }, select: { id: true } });
    const names = await respondentNamesById(watched.map((d) => d.respondentRowId));
    for (const deadline of watched) {
      const who = names.get(deadline.respondentRowId);
      for (const member of secretariat) {
        await notify({
          userId: member.id,
          caseId: deadline.case.id,
          message: `Case ${caseLabel(deadline.case)}: the "${deadline.stage.toLowerCase()}" deadline${who ? ` for ${who}` : ""} has passed.`,
        });
      }
    }
  }

  return { count: lapsed.length };
}

// --- Deadline approaching ----------------------------------------------------
// Short windows (the 3- and 5-day ones) warn a day ahead; longer ones warn three
// days ahead. Each deadline is warned about once (reminderSentAt), and only
// while still PENDING and not yet due — a lapsed one is the overdue sweep's.
const DAY_MS = 24 * 60 * 60 * 1000;

function reminderLeadMs(deadline) {
  const windowMs = deadline.dueAt - deadline.createdAt;
  return (windowMs <= 5 * DAY_MS ? 1 : 3) * DAY_MS;
}

function daysLeftText(dueAt) {
  const hours = Math.max(1, Math.round((dueAt - Date.now()) / (60 * 60 * 1000)));
  return hours < 24 ? `in about ${hours} hour${hours === 1 ? "" : "s"}` : `in ${Math.round(hours / 24)} day(s)`;
}

// Who has to act before each deadline, and what they are being reminded of.
function reminderFor(deadline, caseRecord, row) {
  const stage = deadline.stage;
  const ref = caseLabel(caseRecord);
  const when = daysLeftText(deadline.dueAt);
  if (stage.includes("NOTARIZED COMPLAINT")) {
    return {
      roles: [],
      userIds: [caseRecord.complainantId],
      message: `Reminder for case ${ref}: your notarized complaint is due ${when}. Upload it before the window closes, or the case may be dismissed.`,
    };
  }
  if (stage.includes("RESPONDENT RESPONSE")) {
    return {
      roles: ["SECRETARIAT"],
      userIds: [row ? row.userId : caseRecord.respondentId].filter(Boolean),
      message: `Reminder for case ${ref}: ${row ? `${row.claimedName}'s` : "the respondent's"} response is due ${when}.`,
    };
  }
  if (stage.includes("PRESIDENT DECISION")) {
    return {
      roles: ["DISCIPLINING_AUTHORITY", "SECRETARIAT"],
      userIds: [],
      message: `Reminder for case ${ref}: the decision is due ${when}.`,
    };
  }
  if (stage.includes("POSITION PAPER COMPLAINANT")) {
    return {
      roles: [],
      userIds: [caseRecord.complainantId],
      message: `Reminder for case ${ref}: your notarized position paper is due ${when}.`,
    };
  }
  if (stage.includes("POSITION PAPER")) {
    return {
      roles: ["SECRETARIAT"],
      userIds: [row ? row.userId : caseRecord.respondentId].filter(Boolean),
      message: `Reminder for case ${ref}: ${row ? `${row.claimedName}'s` : "the respondent's"} notarized position paper is due ${when}.`,
    };
  }
  if (stage.includes("ANSWER TO CHARGE")) {
    return {
      roles: ["SECRETARIAT"],
      userIds: [row ? row.userId : caseRecord.respondentId].filter(Boolean),
      message: `Reminder for case ${ref}: ${row ? `${row.claimedName}'s` : "the respondent's"} answer to the formal charge is due ${when}.`,
    };
  }
  if (stage.includes("REPORT TO PRESIDENT")) {
    return {
      roles: ["SECRETARIAT"],
      userIds: [],
      message: `Reminder for case ${ref}: the report to the President is due ${when}.`,
    };
  }
  return {
    roles: ["SECRETARIAT"],
    userIds: [],
    message: `Reminder for case ${ref}: the "${stage.toLowerCase()}" deadline is due ${when}.`,
  };
}

export async function sweepApproachingDeadlines() {
  const now = new Date();
  const candidates = await prisma.deadline.findMany({
    where: { status: "PENDING", reminderSentAt: null, dueAt: { gt: now, lte: new Date(now.getTime() + 3 * DAY_MS) } },
    include: {
      case: { select: { id: true, caseNumber: true, cpiNumber: true, referenceNumber: true, complainantId: true, respondentId: true } },
    },
  });
  const due = candidates.filter((d) => d.dueAt - now <= reminderLeadMs(d));
  if (due.length === 0) return { count: 0 };

  for (const deadline of due) {
    // Claim it first: if two sweeps overlap, only the one that flips
    // reminderSentAt from null sends anything.
    const claimed = await prisma.deadline.updateMany({
      where: { id: deadline.id, reminderSentAt: null },
      data: { reminderSentAt: new Date() },
    });
    if (claimed.count === 0) continue;

    const row = deadline.respondentRowId
      ? await prisma.caseRespondent.findUnique({
          where: { id: deadline.respondentRowId },
          select: { userId: true, claimedName: true },
        })
      : null;
    const { roles, userIds, message } = reminderFor(deadline, deadline.case, row);
    const byRole = roles.length
      ? await prisma.user.findMany({ where: { role: { in: roles } }, select: { id: true } })
      : [];
    const recipients = [...new Set([...userIds, ...byRole.map((u) => u.id)])];
    for (const userId of recipients) {
      await notify({ userId, caseId: deadline.case.id, message });
    }
  }
  return { count: due.length };
}
