import { prisma } from "../prismaClient.js";
import { notify } from "./auditService.js";
import { caseLabel } from "../utils/caseLabel.js";

// Once the respondent has answered (or the Secretariat proceeds without an
// answer), the next step is the Committee meeting where the prima facie
// question is decided. The Committee can't vote until it's confirmed. Lives
// here rather than in a route so both the case routes and the document review
// that accepts a response can reach it.
export async function notifySecretariatToScheduleMeeting(caseRecord) {
  const secretariat = await prisma.user.findMany({ where: { role: "SECRETARIAT" }, select: { id: true } });
  for (const member of secretariat) {
    await notify({
      userId: member.id,
      caseId: caseRecord.id,
      message: `Case ${caseLabel(caseRecord)} is ready for prima facie evaluation. Set the Committee meeting date. The Committee votes once the meeting is confirmed.`,
    });
  }
}

export function getActiveRound(caseId) {
  return prisma.schedulingRound.findFirst({ where: { caseId, status: "PROPOSED" } });
}

// Supersedes any existing PROPOSED round for the case, then creates a new
// one with the given candidate slots (1-5 dates).
export async function proposeRound({ caseId, proposedById, slotDates, purpose = "COMMITTEE_MEETING" }) {
  return prisma.$transaction(async (tx) => {
    // Only rounds for the same thing supersede each other: a hearing being
    // scheduled must not cancel an open meeting round, or the other way round.
    await tx.schedulingRound.updateMany({
      where: { caseId, status: "PROPOSED", purpose },
      data: { status: "SUPERSEDED" },
    });
    return tx.schedulingRound.create({
      data: {
        caseId,
        proposedById,
        purpose,
        slots: { create: slotDates.map((startAt) => ({ startAt })) },
      },
      include: { slots: true },
    });
  });
}

// Replaces the voter's prior picks for this round with the given slot ids.
export async function castVotes({ roundId, voterId, slotIds }) {
  return prisma.$transaction(async (tx) => {
    await tx.slotVote.deleteMany({ where: { voterId, slot: { roundId } } });
    if (slotIds.length > 0) {
      await tx.slotVote.createMany({
        data: slotIds.map((slotId) => ({ slotId, voterId })),
      });
    }
  });
}

export async function finalizeRound({ roundId, slotId, finalizedById }) {
  return prisma.schedulingRound.update({
    where: { id: roundId },
    data: {
      status: "FINALIZED",
      finalizedSlotId: slotId,
      finalizedById,
      finalizedAt: new Date(),
    },
  });
}

export function getCommitteeAndChairIds() {
  return prisma.user.findMany({
    where: { role: { in: ["COMMITTEE", "CHAIRPERSON"] }, deactivatedAt: null },
    select: { id: true },
  });
}

// A slot needs this many votes before the Secretariat can finalize it,
// whether it's a Committee-meeting or a Hearing round.
export const MIN_SLOT_VOTES_TO_FINALIZE = 5;

export function slotMeetsFinalizeQuorum(slot) {
  return (slot.votes?.length ?? 0) >= MIN_SLOT_VOTES_TO_FINALIZE;
}

// Who is "required" to vote on a case's prima facie question: everyone who
// voted availability for the Committee-meeting date the Secretariat actually
// finalized — not every active Committee/Chairperson system-wide. Falls back
// to the old system-wide count when there's no scoped set yet (no finalized
// Committee-meeting round, or — only possible for rounds finalized before
// this feature shipped — a finalized slot with zero recorded votes), so
// nothing that already depends on this count can see a 0/undefined total.
export async function getPrimaFacieRequiredVoters(caseId) {
  const round = await prisma.schedulingRound.findFirst({
    where: { caseId, purpose: "COMMITTEE_MEETING", status: "FINALIZED" },
    orderBy: { finalizedAt: "desc" },
  });

  if (round?.finalizedSlotId) {
    const votes = await prisma.slotVote.findMany({
      where: { slotId: round.finalizedSlotId, voter: { deactivatedAt: null } },
      select: { voterId: true },
    });
    const ids = [...new Set(votes.map((v) => v.voterId))];
    if (ids.length > 0) {
      return { scoped: true, ids, count: ids.length };
    }
  }

  // Fallback: pre-existing system-wide behavior.
  const count = await prisma.user.count({
    where: { role: { in: ["COMMITTEE", "CHAIRPERSON"] }, deactivatedAt: null },
  });
  return { scoped: false, ids: null, count };
}
