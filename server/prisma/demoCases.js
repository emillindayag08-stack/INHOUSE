import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { getPersonById } from "../src/services/directory/index.js";

// Demo data: 13 fictional cases filed across a full year (Oct 2025 – Oct 2026)
// covering all nine case statuses, so the Reports page, Calendar, and case
// lists have something realistic to show.
//
//   node prisma/demoCases.js           add the demo cases not loaded yet
//   node prisma/demoCases.js --remove  delete them again, and nothing else
//   node prisma/demoCases.js --staff-only
//                                      the same cases between the two personnel
//                                      accounts only, with workplace versions of
//                                      the student stories (all RACCS 2025)
//
// Both sides of every case are people from the BulSU directory (the four
// the seed creates), named here by directory id. Cases carry isDemo, which is
// how --remove finds exactly its own rows; no account is ever created or
// deleted by this script. Two people appear on both sides of different cases
// — that pair is the point of the demo.

const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;

// Manila-time timestamp `days` days after `date` ("YYYY-MM-DD"), at `time`.
function at(date, days = 0, time = "10:00") {
  return new Date(new Date(`${date}T${time}:00+08:00`).getTime() + days * DAY);
}

// The directory people these cases involve, by student/employee number.
// Serah and Paulo each appear on both sides of different cases: one account,
// both sides.
const P = {
  serah: "2022-10431",   // Francine Giron   — student, CICT
  paolo: "2021-02310",   // Anne Giron   — student, COE
  monica: "EMP-1042",    // Iya Reyes  — personnel, CBEA
  luis: "EMP-1188",      // Bregil Dolorain    — personnel, CAL
};

// --staff-only: the two students' parts are played by the two personnel
// accounts. Every case still has two different people (no case pairs Monica
// with Serah or Luis with Paolo), and the student-setting stories get a
// workplace version, keyed by filing date.
const STAFF_ONLY = process.argv.includes("--staff-only");
const STAFF_PEOPLE = { [P.serah]: P.monica, [P.paolo]: P.luis };
const STAFF_DESCRIPTIONS = {
  "2025-10-08": "During a faculty planning session at the CICT conference room, the respondent repeatedly made unwelcome remarks about the complainant's body and continued after being asked to stop.",
  "2026-01-20": "The complainant reported that the respondent made sexist jokes directed at the complainant during a faculty meeting presentation.",
  "2026-02-11": "The respondent allegedly made inappropriate remarks about the complainant's appearance during a department inventory session.",
  "2026-03-09": "The respondent allegedly shared an edited photo of the complainant with sexual captions in the department's staff group chat.",
  "2026-07-16": "The respondent allegedly posted derogatory comments about the complainant's gender identity on the employees' association page.",
};
const person = (id) => (STAFF_ONLY ? STAFF_PEOPLE[id] ?? id : id);

// Offsets are days after filing. `status` is where the case stands today.
const CASES = [
  {
    filed: "2025-10-08", complainant: P.serah, status: "RESOLVED",
    respondent: P.paolo,
    description: "During a group study session at the CICT laboratory, the respondent repeatedly made unwelcome remarks about the complainant's body and continued after being asked to stop.",
    peer: true, first: true,
    notarized: 2, verified: 3, showCauseDrafted: 4, showCauseApproved: 5, answered: 9,
    votes: [true, true, true], evaluated: 14, risk: { at: 16, s: 1, f: 2, e: 1 },
    charged: 20, formalAnswer: 26, pathway: "POSITION_PAPER",
    deliberated: 48, decision: { at: 62, outcome: "LIABLE", penalty: "Written reprimand and gender sensitivity seminar" },
  },
  {
    filed: "2025-11-14", complainant: P.paolo, status: "DISMISSED",
    respondent: P.monica,
    description: "The respondent, a staff member at the CBEA office, allegedly made suggestive comments while the complainant was processing enrollment documents.",
    peer: false, first: true,
    notarized: 1, verified: 2, showCauseDrafted: 3, showCauseApproved: 4, answered: 12,
    votes: [false, false, true], evaluated: 19,
  },
  {
    filed: "2025-12-03", complainant: P.paolo, status: "RESOLVED",
    respondent: P.serah,
    description: "The respondent repeatedly sent unsolicited messages of a sexual nature to the complainant through social media after a department event.",
    peer: true, first: false,
    notarized: 3, verified: 4, showCauseDrafted: 5, showCauseApproved: 6, answered: 10,
    votes: [true, true, true], evaluated: 15, risk: { at: 17, s: 2, f: 2, e: 2 },
    charged: 21, formalAnswer: 29, pathway: "FORMAL_INVESTIGATION",
    round: { at: 30, slots: [36, 37, 38], voters: ["committee1", "committee2", "committee3", "chair"] },
    hearings: [{ at: 36, mode: "In-person" }, { at: 58, mode: "In-person" }],
    endedInvestigation: 70, decision: { at: 84, outcome: "LIABLE", penalty: "Suspension of 30 days" },
  },
  {
    filed: "2026-01-20", complainant: P.serah, status: "DISMISSED",
    respondent: P.paolo,
    description: "The complainant reported that the respondent made sexist jokes directed at the complainant during a class presentation.",
    peer: true, first: true,
    notarized: null, dismissedNoncompliance: 6,
  },
  {
    filed: "2026-02-11", complainant: P.serah, status: "DISMISSED",
    respondent: P.luis,
    description: "The respondent, an instructor, allegedly made inappropriate remarks about the complainant's appearance during a laboratory session.",
    peer: false, first: true,
    notarized: 4, verified: 5, showCauseDrafted: 6, showCauseApproved: 8, answered: 16,
    votes: [true, true, false], evaluated: 21, risk: { at: 23, s: 1, f: 1, e: 2 },
    charged: 28, formalAnswer: 36, pathway: "POSITION_PAPER",
    deliberated: 60, decision: { at: 71, outcome: "NOT_LIABLE", penalty: null },
  },
  {
    filed: "2026-03-09", complainant: P.paolo, status: "RESOLVED",
    respondent: P.serah,
    description: "The respondent allegedly shared an edited photo of the complainant with sexual captions in a class group chat.",
    peer: true, first: true,
    notarized: 1, verified: 2, showCauseDrafted: 3, showCauseApproved: 3, answered: 7,
    votes: [true, true, true], evaluated: 10, risk: { at: 11, s: 3, f: 3, e: 3 },
    charged: 15, formalAnswer: 22, pathway: "FORMAL_INVESTIGATION",
    round: { at: 23, slots: [30, 31, 33], voters: ["committee1", "committee3", "chair"] },
    hearings: [{ at: 30, mode: "In-person" }, { at: 45, mode: "Online" }, { at: 59, mode: "In-person" }],
    endedInvestigation: 66, decision: { at: 88, outcome: "LIABLE", penalty: "Expulsion" },
  },
  {
    filed: "2026-04-22", complainant: P.paolo, status: "HEARING_SCHEDULED",
    respondent: P.monica,
    description: "The respondent, a faculty member, allegedly touched the complainant's shoulder and waist without consent on several occasions.",
    peer: false, first: true,
    notarized: 2, verified: 3, showCauseDrafted: 5, showCauseApproved: 6, answered: 14,
    votes: [true, true, true], evaluated: 20, risk: { at: 22, s: 2, f: 3, e: 2 },
    charged: 30, formalAnswer: 39, pathway: "FORMAL_INVESTIGATION",
    round: { at: 42, slots: [52, 53], voters: ["committee1", "committee2", "chair"] },
    hearings: [{ at: 52, mode: "In-person" }, { at: 160, mode: "Online", scheduledOn: 140 }],
  },
  {
    filed: "2026-06-05", complainant: P.serah, status: "FORMAL_CHARGE_ISSUED",
    respondent: P.paolo,
    description: "The respondent repeatedly followed the complainant around campus and made catcalling remarks despite being told to stop.",
    peer: true, first: true,
    notarized: 3, verified: 4, showCauseDrafted: 6, showCauseApproved: 7, answered: 15,
    votes: [true, false, true], evaluated: 21, risk: { at: 24, s: 2, f: 2, e: 1 },
    charged: 33,
  },
  {
    filed: "2026-07-16", complainant: P.paolo, status: "SHOW_CAUSE_ISSUED",
    respondent: P.serah,
    description: "The respondent allegedly posted derogatory comments about the complainant's gender identity on a student organization's page.",
    peer: true, first: true,
    notarized: 2, verified: 3, showCauseDrafted: 5, showCauseApproved: 6,
  },
  {
    // For Decision: the CODI report is with the President.
    filed: "2026-08-05", complainant: P.paolo, status: "DELIBERATION",
    respondent: P.monica,
    description: "The respondent allegedly sent the complainant repeated late-night messages with sexual innuendo after a consultation.",
    peer: false, first: true,
    notarized: 2, verified: 3, showCauseDrafted: 4, showCauseApproved: 5, answered: 12,
    votes: [true, true, true], evaluated: 18, risk: { at: 19, s: 2, f: 2, e: 2 },
    charged: 22, formalAnswer: 30, pathway: "POSITION_PAPER",
    deliberated: 70,
  },
  {
    filed: "2026-09-02", complainant: P.luis, status: "ANSWER_SUBMITTED",
    respondent: P.monica,
    description: "The respondent allegedly made remarks with sexual undertones during an office meeting.",
    peer: false, first: true,
    // Answered; waiting on the Secretariat to set the Committee meeting,
    // which is what opens the prima facie vote.
    notarized: 1, verified: 2, showCauseDrafted: 3, showCauseApproved: 4, answered: 12,
  },
  {
    // Verified: the Secretariat has accepted it and has yet to draft the show-cause order.
    filed: "2026-10-13", complainant: P.monica, status: "VERIFIED",
    respondent: P.luis,
    description: "The respondent allegedly made comments about the complainant's body in front of colleagues at the faculty lounge.",
    peer: true, first: true,
    notarized: 1, verified: 3,
  },
  {
    // Filed: just submitted, the notarized copy still due.
    filed: "2026-10-26", complainant: P.serah, status: "SUBMITTED",
    respondent: P.luis,
    description: "The respondent allegedly made an unwelcome comment about the complainant's appearance during consultation hours.",
    peer: false, first: true,
    notarized: null,
  },
];

// Deadline windows, mirroring deadlineService.js.
const RESPONSE_DAYS = { GBSH_CODE: 5, RACCS: 10 };
const FORMAL_CHARGE_DAYS = { GBSH_CODE: 15 };

function classify(total) {
  if (total <= 4) return "LIGHT";
  if (total <= 7) return "LESS_GRAVE";
  return "GRAVE";
}

// Mirrors nextSequenceNumber in cases.routes.js so the demo numbers continue
// each year's sequence instead of colliding with real cases.
async function nextNumber(field, prefix, year) {
  const count = await prisma.case.count({ where: { [field]: { startsWith: `${prefix}-${year}-` } } });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

function deadlineStatus(dueAt, completedAt, now) {
  if (completedAt) return { status: "MET", completedAt };
  return { status: dueAt < now ? "OVERDUE" : "PENDING", completedAt: null };
}

async function addDemoCases() {
  // Adds only the demo cases not loaded yet (matched by filing date), so a
  // demo case someone has since worked on is never duplicated or reset. Run
  // with --remove first to reload them all from scratch.
  const loaded = await prisma.case.findMany({ where: { isDemo: true }, select: { filedAt: true } });
  const loadedDates = new Set(loaded.map((c) => c.filedAt.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })));
  const toAdd = CASES.filter((spec) => !loadedDates.has(spec.filed));
  if (toAdd.length === 0) {
    console.log(`All ${loaded.length} demo cases are already loaded. Run with --remove first to reload them.`);
    return;
  }

  const byEmail = async (email) => {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new Error(`Seed user ${email} not found — run "npm run seed" first.`);
    return user;
  };
  const staff = {
    secretariat: await byEmail("emillindayag008@gmail.com"),
    chair: await byEmail("emillindayag08@gmail.com"),
    committee1: await byEmail("tamayopaularon.spnhs@gmail.com"),
    committee2: await byEmail("bangbang3027@gmail.com"),
    committee3: await byEmail("weasleyjohnmarco@gmail.com"),
  };
  const committee = [staff.committee1, staff.committee2, staff.committee3];

  // Every party is an existing directory account (created by the seed).
  const userFor = async (directoryId) => {
    const user = await prisma.user.findUnique({ where: { directoryId } });
    if (!user) throw new Error(`Directory account ${directoryId} not found — run "npm run seed" first.`);
    return user;
  };

  const now = new Date();
  const created = [];

  for (const spec of toAdd) {
    const T = (days, time) => (days === undefined || days === null ? null : at(spec.filed, days, time));
    const complainant = await userFor(person(spec.complainant));
    const respondentUser = await userFor(person(spec.respondent));
    const respondentPerson = getPersonById(person(spec.respondent));
    const framework = respondentPerson.type === "STUDENT" ? "GBSH_CODE" : "RACCS";
    const filedAt = T(0, "09:15");
    const logs = [];
    const log = (userId, action, when, details) => logs.push({ userId, action, createdAt: when, details });

    const respondentUserId = respondentUser.id;

    const referenceNumber = await nextNumber("referenceNumber", "REF", spec.filed.slice(0, 4));
    const found = spec.votes ? spec.votes.filter(Boolean).length > spec.votes.length / 2 : null;
    const caseNumber =
      spec.evaluated !== undefined && found
        ? await nextNumber("caseNumber", "CODI", T(spec.evaluated).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 4))
        : null;

    // Verification is what turns the REF number into a CPI number.
    const cpiNumber =
      spec.verified !== undefined && spec.verified !== null && T(spec.verified) <= now
        ? await nextNumber("cpiNumber", "CPI", T(spec.verified).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }).slice(0, 4))
        : null;

    const lastEvent = [spec.decision?.at, spec.endedInvestigation, spec.hearings?.at(-1)?.at, spec.deliberated, spec.formalAnswer, spec.charged, spec.risk?.at, spec.evaluated, spec.answered, spec.showCauseApproved, spec.verified, spec.dismissedNoncompliance, spec.notarized]
      .filter((d) => d !== undefined && d !== null)
      .map((d) => T(d))
      .filter((d) => d <= now);
    const updatedAt = lastEvent.length ? new Date(Math.max(...lastEvent)) : filedAt;

    const theCase = await prisma.case.create({
      data: {
        referenceNumber,
        cpiNumber,
        caseNumber,
        complainantId: complainant.id,
        respondentId: respondentUser.id,
        respondentTypeAtFiling: respondentPerson.type,
        respondentCollegeAtFiling: respondentPerson.college,
        // What the complainant named, and the Secretariat confirming it —
        // demo cases start past that step.
        claimedRespondentName: respondentPerson.fullName,
        claimedRespondentType: respondentPerson.type,
        claimedRespondentCollege: respondentPerson.college,
        respondentConfirmedAt: T(spec.verified ?? 1),
        respondentConfirmedById: staff.secretariat.id,
        isDemo: true,
        description: (STAFF_ONLY && STAFF_DESCRIPTIONS[spec.filed]) || spec.description,
        isPeerToPeer: spec.peer,
        isFirstOffense: spec.first,
        governingFramework: framework,
        status: spec.status,
        // Every way this demo dismisses a case (non-compliance, no prima facie
        // case, not liable) is without prejudice in the app, and records where
        // the case stood so it can be reopened.
        ...(spec.status === "DISMISSED" && {
          dismissalType: "WITHOUT_PREJUDICE",
          statusBeforeClose: spec.decision ? "DELIBERATION" : spec.dismissedNoncompliance !== undefined ? "SUBMITTED" : "UNDER_EVALUATION",
        }),
        filedAt,
        updatedAt,
        respondentPathwayChoice: spec.pathway || null,
        complainantPathwayChoice: spec.pathway || null,
        complainantPathwayChosenAt: spec.pathway ? T(spec.formalAnswer - 1) : null,
        finalPathway: spec.pathway || null,
      },
    });
    const caseId = theCase.id;
    // The respondent as a CaseRespondent row, which is what the app reads for
    // who answers, who is served and what each chose. Demo cases name one.
    const respondentRow = await prisma.caseRespondent.create({
      data: {
        caseId,
        position: 0,
        userId: respondentUser.id,
        claimedName: respondentPerson.fullName,
        claimedType: respondentPerson.type,
        claimedCollege: respondentPerson.college,
        typeAtFiling: respondentPerson.type,
        collegeAtFiling: respondentPerson.college,
        confirmedAt: T(spec.verified ?? 1),
        confirmedById: staff.secretariat.id,
        pathwayChoice: spec.pathway || null,
      },
    });
    log(complainant.id, "COMPLAINT_SUBMITTED", filedAt, `Case ${referenceNumber} filed against ${respondentPerson.fullName}`);

    // Intake: the notarized complaint is due 3 days after filing.
    const notarizedDue = T(3, "23:59");
    await prisma.deadline.create({
      data: {
        caseId,
        stage: "NOTARIZED COMPLAINT",
        dueAt: notarizedDue,
        createdAt: filedAt,
        ...deadlineStatus(notarizedDue, T(spec.notarized, "14:00"), now),
      },
    });
    if (spec.notarized !== null && spec.notarized !== undefined) {
      log(staff.secretariat.id, "DOCUMENT_NOTARIZATION_UPDATED", T(spec.notarized, "14:00"), "Notarized complaint confirmed as notarized");
    }
    if (spec.dismissedNoncompliance !== undefined) {
      log(staff.committee1.id, "CASE_DISMISSED_NONCOMPLIANCE", T(spec.dismissedNoncompliance), "Dismissed by the Committee: notarized complaint not submitted within the 3-day window");
    }
    if (spec.verified !== undefined) {
      log(staff.secretariat.id, "COMPLAINT_VERIFICATION", T(spec.verified), "Complaint verified as compliant");
    }

    // Show-cause order: drafted by the Secretariat, approved by the Chairperson,
    // then served on the respondent by the Secretariat. Service is what starts
    // the response window, so the demo serves each order the same afternoon.
    if (spec.showCauseDrafted !== undefined) {
      const approvedAt = T(spec.showCauseApproved, "15:00");
      const servedAt = T(spec.showCauseServed ?? spec.showCauseApproved, "16:30");
      const responseDue = new Date(servedAt.getTime() + RESPONSE_DAYS[framework] * DAY);
      await prisma.showCauseOrder.create({
        data: {
          caseId,
          issuedById: staff.secretariat.id,
          content: `SHOW-CAUSE ORDER\n\nTo: ${respondentPerson.fullName}\n\nYou are directed to submit a written explanation within ${RESPONSE_DAYS[framework]} days of receipt of this order why no disciplinary action should be taken against you in connection with the complaint filed under ${referenceNumber}.\n\n(Demo record.)`,
          status: "SERVED",
          issuedAt: T(spec.showCauseDrafted),
          reviewedById: staff.chair.id,
          reviewedAt: approvedAt,
          servedById: staff.secretariat.id,
          servedAt,
          responseDeadline: responseDue,
        },
      });
      log(staff.secretariat.id, "SHOW_CAUSE_DRAFTED", T(spec.showCauseDrafted), "Show-cause order sent to the Chairperson for approval");
      log(staff.chair.id, "SHOW_CAUSE_APPROVED", approvedAt, "Show-cause order approved by the Chairperson; returned to the Secretariat for service");
      log(staff.secretariat.id, "SHOW_CAUSE_SERVED", servedAt, "Show-cause order served on the respondent by the Secretariat");
      // Service is what hands the case to the respondent.
      await prisma.case.update({ where: { id: caseId }, data: { respondentAssignedAt: servedAt } });
      await prisma.caseRespondent.update({ where: { id: respondentRow.id }, data: { assignedAt: servedAt } });
      await prisma.deadline.create({
        data: {
          caseId,
          respondentRowId: respondentRow.id,
          stage: "RESPONDENT RESPONSE",
          dueAt: responseDue,
          createdAt: servedAt,
          ...deadlineStatus(responseDue, T(spec.answered, "16:00"), now),
        },
      });
    }

    if (spec.answered !== undefined) {
      await prisma.respondentAnswer.create({
        data: {
          caseId,
          submittedById: respondentUserId,
          respondentRowId: respondentRow.id,
          stage: "SHOW_CAUSE",
          content: "I respectfully deny the allegations in the complaint. The remarks were taken out of context and were not intended to offend. (Demo record.)",
          submittedAt: T(spec.answered, "16:00"),
        },
      });
      log(respondentUserId, "ANSWER_SUBMITTED", T(spec.answered, "16:00"), null);
    }

    // Prima facie: every Committee member votes, then the Secretariat confirms.
    if (spec.votes) {
      for (const [i, vote] of spec.votes.entries()) {
        const votedAt = T((spec.evaluated ?? spec.answered + 3) - 2 + i * 0.1);
        await prisma.primaFacieVote.create({
          data: {
            caseId,
            voterId: committee[i].id,
            respondentRowId: respondentRow.id,
            found: vote,
            rationale: vote
              ? "The complaint and supporting evidence establish a prima facie case that warrants a formal charge."
              : "The allegations, even if true, are not sufficiently supported by the evidence on record.",
            votedAt,
          },
        });
        log(committee[i].id, "PRIMA_FACIE_VOTE", votedAt, vote ? "Voted: prima facie case found" : "Voted: no prima facie case");
      }
    }
    if (spec.evaluated !== undefined) {
      const yes = spec.votes.filter(Boolean).length;
      await prisma.primaFacieEvaluation.create({
        data: {
          caseId,
          respondentRowId: respondentRow.id,
          evaluatedById: staff.secretariat.id,
          found,
          rationale: `Confirmed by the Secretariat on the Committee's vote (${yes} of ${spec.votes.length} found a prima facie case).`,
          evaluatedAt: T(spec.evaluated),
        },
      });
      await prisma.caseRespondent.update({ where: { id: respondentRow.id }, data: { primaFacieFound: found } });
      log(staff.secretariat.id, "PRIMA_FACIE_EVALUATION", T(spec.evaluated), found ? "Prima facie case found" : "No prima facie case — dismissed");
    }

    if (spec.risk) {
      const total = spec.risk.s + spec.risk.f + spec.risk.e;
      await prisma.riskAssessment.create({
        data: {
          caseId,
          respondentRowId: respondentRow.id,
          evaluatedById: staff.committee2.id,
          severityScore: spec.risk.s,
          frequencyScore: spec.risk.f,
          evidenceScore: spec.risk.e,
          totalScore: total,
          classification: classify(total),
          evaluatedAt: T(spec.risk.at),
        },
      });
      await prisma.caseRespondent.update({ where: { id: respondentRow.id }, data: { offenseClassification: classify(total) } });
      // The case mirrors its one respondent's level, as the app keeps it.
      await prisma.case.update({ where: { id: caseId }, data: { offenseClassification: classify(total) } });
      log(staff.committee2.id, "RISK_ASSESSMENT_RECORDED", T(spec.risk.at), `Classified as ${classify(total).replace("_", " ").toLowerCase()}`);
    }

    // Formal charge, and the respondent's notarized answer to it.
    if (spec.charged !== undefined) {
      await prisma.formalCharge.create({
        data: {
          caseId,
          issuedById: staff.secretariat.id,
          chargeDetails: `Formal charge for violation of the ${framework === "GBSH_CODE" ? "BulSU Anti-GBSH Code" : "2025 RACCS"} in connection with ${referenceNumber}. (Demo record.)`,
          issuedAt: T(spec.charged),
        },
      });
      log(staff.secretariat.id, "FORMAL_CHARGE_ISSUED", T(spec.charged), null);
      if (FORMAL_CHARGE_DAYS[framework]) {
        const due = T(spec.charged + FORMAL_CHARGE_DAYS[framework], "23:59");
        await prisma.deadline.create({
          data: {
            caseId,
            stage: "FORMAL CHARGE",
            dueAt: due,
            createdAt: T(spec.charged),
            ...deadlineStatus(due, T(spec.formalAnswer, "11:00"), now),
          },
        });
      }
    }
    if (spec.formalAnswer !== undefined) {
      await prisma.respondentAnswer.create({
        data: { caseId, submittedById: respondentUserId, respondentRowId: respondentRow.id, stage: "FORMAL_CHARGE", submittedAt: T(spec.formalAnswer, "11:00") },
      });
      log(respondentUserId, "FORMAL_ANSWER_SUBMITTED", T(spec.formalAnswer, "11:00"), `Chose pathway: ${spec.pathway.replace("_", " ")}`);
      log(complainant.id, "PATHWAY_CHOSEN", T(spec.formalAnswer - 1), `Chose pathway: ${spec.pathway.replace("_", " ")}`);
    }

    // Committee meeting poll: candidate slots, availability votes, one finalized.
    if (spec.round) {
      const round = await prisma.schedulingRound.create({
        data: { caseId, proposedById: staff.secretariat.id, status: "FINALIZED", createdAt: T(spec.round.at) },
      });
      const slots = [];
      for (const offset of spec.round.slots) {
        slots.push(await prisma.meetingSlot.create({ data: { roundId: round.id, startAt: T(offset, "13:30"), createdAt: T(spec.round.at) } }));
      }
      for (const voter of spec.round.voters) {
        await prisma.slotVote.create({ data: { slotId: slots[0].id, voterId: staff[voter].id, createdAt: T(spec.round.at + 1) } });
      }
      await prisma.schedulingRound.update({
        where: { id: round.id },
        data: { finalizedSlotId: slots[0].id, finalizedById: staff.secretariat.id, finalizedAt: T(spec.round.at + 2) },
      });
      log(staff.secretariat.id, "SCHEDULING_FINALIZED", T(spec.round.at + 2), "Committee meeting schedule finalized");
    }

    for (const [i, hearing] of (spec.hearings || []).entries()) {
      await prisma.hearing.create({
        data: {
          caseId,
          type: i === 0 ? "PRE_TRIAL" : "TRIAL",
          scheduledAt: T(hearing.at, "09:00"),
          mode: hearing.mode,
          scheduledById: staff.secretariat.id,
          createdAt: T(hearing.scheduledOn ?? hearing.at - 10),
        },
      });
      log(staff.secretariat.id, "HEARING_SCHEDULED", T(hearing.scheduledOn ?? hearing.at - 10), `${i === 0 ? "Pre-Trial" : "Trial"} scheduled (${hearing.mode})`);
    }
    if (spec.endedInvestigation !== undefined) {
      log(staff.secretariat.id, "FORMAL_INVESTIGATION_ENDED", T(spec.endedInvestigation), null);
      log(staff.secretariat.id, "RECOMMENDATION_FILED", T(spec.endedInvestigation + 7), null);
    }

    if (spec.deliberated !== undefined) {
      await prisma.deliberation.create({
        data: {
          caseId,
          recordedById: staff.committee1.id,
          notes: "CODI report prepared on the parties' position papers. (Demo record.)",
          recommendation: spec.decision?.penalty || "Dismissal of the complaint for insufficiency of evidence.",
          recordedAt: T(spec.deliberated),
        },
      });
      log(staff.committee1.id, "DELIBERATION_RECORDED", T(spec.deliberated), null);
      // The CODI report is with the President, who decides within 30 days.
      const decisionDue = T(spec.deliberated + 30, "23:59");
      await prisma.deadline.create({
        data: {
          caseId,
          stage: "PRESIDENT DECISION",
          dueAt: decisionDue,
          createdAt: T(spec.deliberated),
          ...deadlineStatus(decisionDue, spec.decision ? T(spec.decision.at) : null, now),
        },
      });
    }

    if (spec.decision) {
      await prisma.decision.create({
        data: {
          caseId,
          decidedById: staff.secretariat.id,
          outcome: spec.decision.outcome,
          penalty: spec.decision.penalty,
          rationale:
            spec.decision.outcome === "LIABLE"
              ? "The evidence on record substantially supports the allegations in the complaint."
              : "The evidence on record does not substantially support the allegations in the complaint.",
          decidedAt: T(spec.decision.at),
        },
      });
      log(staff.secretariat.id, spec.pathway === "FORMAL_INVESTIGATION" ? "INVESTIGATION_OUTCOME_FILED" : "DECISION_RECORDED", T(spec.decision.at), spec.decision.outcome.replace("_", " "));
    }

    // Future-dated steps (e.g. a hearing scheduled for next month) still get
    // their record, but no audit entry pretending they already happened.
    await prisma.auditLog.createMany({
      data: logs
        .filter((l) => l.userId && l.createdAt <= now)
        .map((l) => ({ ...l, caseId })),
    });

    created.push(`${caseNumber || referenceNumber}  filed ${spec.filed}  ${spec.status}`);
  }

  console.log(`Added ${created.length} demo cases:\n  ${created.join("\n  ")}`);
  console.log("\nBoth sides of every case are directory accounts — sign in as any of them with Passw0rd!.");
}

async function removeDemoCases() {
  // Only the cases this script created. Directory accounts are permanent —
  // they belong to the university, not to the demo.
  const cases = await prisma.case.findMany({ where: { isDemo: true }, select: { id: true } });
  const caseIds = cases.map((c) => c.id);
  const inCases = { caseId: { in: caseIds } };

  await prisma.$transaction([
    prisma.schedulingRound.updateMany({ where: inCases, data: { finalizedSlotId: null } }),
    prisma.slotVote.deleteMany({ where: { slot: { round: inCases } } }),
    prisma.meetingSlot.deleteMany({ where: { round: inCases } }),
    prisma.schedulingRound.deleteMany({ where: inCases }),
    prisma.showCauseOrder.deleteMany({ where: inCases }),
    prisma.document.deleteMany({ where: inCases }),
    prisma.hearing.deleteMany({ where: inCases }),
    ...[
      prisma.notification,
      prisma.auditLog,
      prisma.deadline,
      prisma.decision,
      prisma.deliberation,
      prisma.formalCharge,
      prisma.riskAssessment,
      prisma.primaFacieEvaluation,
      prisma.primaFacieVote,
      prisma.respondentAnswer,
      prisma.investigationStatusUpdate,
    ].map((model) => model.deleteMany({ where: inCases })),
    prisma.case.deleteMany({ where: { id: { in: caseIds } } }),
  ]);
  console.log(`Removed ${caseIds.length} demo cases. Directory accounts were left alone.`);
}

(process.argv.includes("--remove") ? removeDemoCases() : addDemoCases())
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
