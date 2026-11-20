import { notifyRespondents } from "../services/respondentService.js";
import { Router } from "express";
import { prisma } from "../prismaClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { logAction, notify } from "../services/auditService.js";
import { caseLabel } from "../utils/caseLabel.js";
import {
  proposeRound,
  castVotes,
  finalizeRound,
  getCommitteeAndChairIds,
  MIN_SLOT_VOTES_TO_FINALIZE,
  slotMeetsFinalizeQuorum,
} from "../services/schedulingService.js";

// mergeParams so we can read :caseId from the parent mount path.
export const schedulingRouter = Router({ mergeParams: true });
schedulingRouter.use(requireAuth);

// A meeting can't be scheduled before the respondent has actually answered,
// and there's nothing left to schedule once the case has concluded.
const PRE_ANSWER_STATUSES = new Set([
  "SUBMITTED",
  "RETURNED_FOR_CORRECTION",
  "VERIFIED",
  "SHOW_CAUSE_PENDING_APPROVAL",
  "SHOW_CAUSE_APPROVED",
  "SHOW_CAUSE_ISSUED",
  "ANSWER_UNDER_REVIEW",
]);
const TERMINAL_STATUSES = new Set(["DISMISSED", "RESOLVED", "ESCALATED"]);

function formatSlot(date) {
  return new Date(date).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// --- Secretariat: propose up to 5 candidate slots ---------------------------
schedulingRouter.post(
  "/rounds",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const caseRecord = await prisma.case.findUnique({ where: { id: req.params.caseId } });
    if (!caseRecord) return res.status(404).json({ error: "Case not found" });
    const purpose = req.body.purpose === "HEARING" ? "HEARING" : "COMMITTEE_MEETING";
    if (TERMINAL_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({ error: "This case has concluded; scheduling is no longer available." });
    }
    if (purpose === "HEARING") {
      // The same window POST /cases/:id/hearings uses: a hearing belongs to a
      // Formal Investigation that is actually under way.
      if (caseRecord.status !== "FORMAL_CHARGE_ISSUED" && caseRecord.status !== "HEARING_SCHEDULED") {
        return res.status(409).json({
          error: "A hearing can only be scheduled while the formal investigation is in progress.",
        });
      }
      if (caseRecord.finalPathway !== "FORMAL_INVESTIGATION") {
        return res.status(409).json({
          error: "Hearing scheduling is only available once the Formal Investigation pathway is confirmed.",
        });
      }
    } else if (PRE_ANSWER_STATUSES.has(caseRecord.status)) {
      return res.status(409).json({
        error: "Meeting slots can only be proposed after the respondent submits their answer.",
      });
    }

    const rawSlots = Array.isArray(req.body.slots) ? req.body.slots : [];
    const seen = new Set();
    const slotDates = [];
    for (const raw of rawSlots) {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "Each slot must be a valid date/time" });
      }
      const iso = d.toISOString();
      if (!seen.has(iso)) {
        seen.add(iso);
        slotDates.push(d);
      }
    }
    if (slotDates.length < 1 || slotDates.length > 5) {
      return res.status(400).json({ error: "Propose between 1 and 5 candidate slots" });
    }

    const round = await proposeRound({
      caseId: caseRecord.id,
      proposedById: req.user.sub,
      slotDates,
      purpose,
    });

    const what = purpose === "HEARING" ? "hearing" : "meeting";
    await logAction({
      userId: req.user.sub,
      caseId: caseRecord.id,
      action: "SCHEDULING_ROUND_PROPOSED",
      details: `${slotDates.length} candidate ${what} slot(s) proposed`,
    });

    const voters = await getCommitteeAndChairIds();
    for (const voter of voters) {
      await notify({
        userId: voter.id,
        caseId: caseRecord.id,
        message: `Case ${caseLabel(caseRecord)}: the Secretariat proposed ${slotDates.length} candidate ${what} slot(s). Please indicate your availability.`,
      });
    }

    res.status(201).json(round);
  })
);

// --- Committee/Chairperson: cast (replace) multi-select availability --------
schedulingRouter.put(
  "/rounds/:roundId/votes",
  requireRole("COMMITTEE", "CHAIRPERSON"),
  asyncHandler(async (req, res) => {
    const round = await prisma.schedulingRound.findUnique({
      where: { id: req.params.roundId },
      include: { slots: true },
    });
    if (!round || round.caseId !== req.params.caseId) {
      return res.status(404).json({ error: "Scheduling round not found" });
    }
    if (round.status !== "PROPOSED") {
      return res.status(409).json({ error: "This scheduling round is no longer accepting votes." });
    }

    const validSlotIds = new Set(round.slots.map((s) => s.id));
    const slotIds = Array.isArray(req.body.slotIds) ? req.body.slotIds : [];
    if (!slotIds.every((id) => validSlotIds.has(id))) {
      return res.status(400).json({ error: "slotIds must reference slots in this round" });
    }

    await castVotes({ roundId: round.id, voterId: req.user.sub, slotIds });

    await logAction({
      userId: req.user.sub,
      caseId: round.caseId,
      action: "SCHEDULING_VOTE_UPDATED",
      details: `Marked availability for ${slotIds.length} slot(s)`,
    });

    const secretariat = await prisma.user.findMany({
      where: { role: "SECRETARIAT" },
      select: { id: true },
    });
    const caseRecord = await prisma.case.findUnique({ where: { id: round.caseId } });
    for (const member of secretariat) {
      await notify({
        userId: member.id,
        caseId: round.caseId,
        message: `Case ${caseLabel(caseRecord)}: ${req.user.fullName} updated their ${
          round.purpose === "HEARING" ? "hearing" : "meeting"
        } availability.`,
      });
    }

    const updated = await prisma.schedulingRound.findUnique({
      where: { id: round.id },
      include: {
        slots: { include: { votes: { include: { voter: { select: { id: true, fullName: true } } } } } },
      },
    });
    res.json(updated);
  })
);

// --- Secretariat: finalize one slot ------------------------------------------
schedulingRouter.post(
  "/rounds/:roundId/finalize",
  requireRole("SECRETARIAT"),
  asyncHandler(async (req, res) => {
    const round = await prisma.schedulingRound.findUnique({
      where: { id: req.params.roundId },
      include: { slots: { include: { votes: true } } },
    });
    if (!round || round.caseId !== req.params.caseId) {
      return res.status(404).json({ error: "Scheduling round not found" });
    }
    if (round.status !== "PROPOSED") {
      return res.status(409).json({ error: "This scheduling round is no longer accepting votes." });
    }

    const slot = round.slots.find((s) => s.id === req.body.slotId);
    if (!slot) return res.status(400).json({ error: "slotId must reference a slot in this round" });

    if (!slotMeetsFinalizeQuorum(slot)) {
      return res.status(400).json({
        error: `This slot needs at least ${MIN_SLOT_VOTES_TO_FINALIZE} votes before it can be confirmed (currently ${slot.votes.length}).`,
      });
    }

    await finalizeRound({ roundId: round.id, slotId: slot.id, finalizedById: req.user.sub });

    const caseRecord = await prisma.case.findUnique({
      where: { id: round.caseId },
      include: { respondentUser: { select: { id: true } }, respondents: true },
    });
    const formatted = formatSlot(slot.startAt);
    const isHearing = round.purpose === "HEARING";

    // A confirmed hearing slot is the hearing: same record POST
    // /cases/:id/hearings creates, so everything downstream (minutes, notes,
    // ending the investigation) works on it unchanged.
    let hearing = null;
    if (isHearing) {
      if (caseRecord.finalPathway !== "FORMAL_INVESTIGATION") {
        return res.status(409).json({
          error: "Hearing scheduling is only available once the Formal Investigation pathway is confirmed.",
        });
      }
      // The same window proposing uses: once the investigation has ended there
      // are no more hearings to confirm.
      if (caseRecord.status !== "FORMAL_CHARGE_ISSUED" && caseRecord.status !== "HEARING_SCHEDULED") {
        return res.status(409).json({
          error: "The formal investigation has ended; no further hearings can be scheduled.",
        });
      }
      const hearingCount = await prisma.hearing.count({ where: { caseId: round.caseId } });
      hearing = await prisma.hearing.create({
        data: {
          caseId: round.caseId,
          type: hearingCount === 0 ? "PRE_TRIAL" : "TRIAL",
          scheduledAt: slot.startAt,
          mode: typeof req.body.mode === "string" && req.body.mode.trim() ? req.body.mode.trim() : "In-person",
          notes: typeof req.body.notes === "string" && req.body.notes.trim() ? req.body.notes.trim() : null,
          scheduledById: req.user.sub,
        },
      });
      await prisma.schedulingRound.update({
        where: { id: round.id },
        data: { hearingId: hearing.id },
      });
      await prisma.case.update({
        where: { id: round.caseId },
        data: { status: "HEARING_SCHEDULED" },
      });
    }

    const label = isHearing
      ? `${hearing.type === "PRE_TRIAL" ? "Pre-Trial" : "Trial"} hearing`
      : "Meeting";
    await logAction({
      userId: req.user.sub,
      caseId: round.caseId,
      action: isHearing ? "HEARING_SCHEDULED" : "SCHEDULING_FINALIZED",
      details: `${label} finalized for ${formatted}`,
    });

    const partyMessage = `${isHearing ? `A ${label.toLowerCase()}` : "A meeting"} for case ${caseLabel(
      caseRecord
    )} has been scheduled for ${formatted}.`;
    await notify({
      userId: caseRecord.complainantId,
      caseId: round.caseId,
      message: partyMessage,
    });
    await notifyRespondents(caseRecord, partyMessage);
    // At the prima facie stage the confirmed meeting is what opens voting.
    const votingOpens = !isHearing && caseRecord.status === "ANSWER_SUBMITTED";
    const voters = await getCommitteeAndChairIds();
    for (const voter of voters) {
      await notify({
        userId: voter.id,
        caseId: round.caseId,
        message: `Case ${caseLabel(caseRecord)}: the ${
          isHearing ? label.toLowerCase() : "meeting"
        } has been confirmed for ${formatted}.${
          votingOpens ? " Committee members can now vote on the prima facie question and complete the risk assessment." : ""
        }`,
      });
    }

    const updated = await prisma.schedulingRound.findUnique({
      where: { id: round.id },
      include: { slots: true, finalizedSlot: true, hearing: true },
    });
    res.json(updated);
  })
);
