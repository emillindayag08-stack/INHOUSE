import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // A finalized round still points at its slot, so break that link before
  // the slots go.
  await prisma.schedulingRound.updateMany({ data: { finalizedSlotId: null } });
  await prisma.slotVote.deleteMany();
  await prisma.meetingSlot.deleteMany();
  await prisma.schedulingRound.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.deadline.deleteMany();
  await prisma.decision.deleteMany();
  await prisma.deliberation.deleteMany();
  await prisma.investigationStatusUpdate.deleteMany();
  await prisma.hearing.deleteMany();
  await prisma.formalCharge.deleteMany();
  await prisma.riskAssessment.deleteMany();
  await prisma.primaFacieEvaluation.deleteMany();
  await prisma.primaFacieVote.deleteMany();
  await prisma.respondentAnswer.deleteMany();
  await prisma.showCauseOrder.deleteMany();
  await prisma.document.deleteMany();
  await prisma.case.deleteMany();
  await prisma.user.deleteMany();
  console.log("All data wiped.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
