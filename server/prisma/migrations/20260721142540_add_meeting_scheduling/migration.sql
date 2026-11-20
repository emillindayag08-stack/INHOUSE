-- CreateEnum
CREATE TYPE "SchedulingRoundStatus" AS ENUM ('PROPOSED', 'FINALIZED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "SchedulingRound" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "proposedById" TEXT NOT NULL,
    "status" "SchedulingRoundStatus" NOT NULL DEFAULT 'PROPOSED',
    "finalizedSlotId" TEXT,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulingRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingSlot" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotVote" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchedulingRound_finalizedSlotId_key" ON "SchedulingRound"("finalizedSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotVote_slotId_voterId_key" ON "SlotVote"("slotId", "voterId");

-- AddForeignKey
ALTER TABLE "SchedulingRound" ADD CONSTRAINT "SchedulingRound_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRound" ADD CONSTRAINT "SchedulingRound_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRound" ADD CONSTRAINT "SchedulingRound_finalizedSlotId_fkey" FOREIGN KEY ("finalizedSlotId") REFERENCES "MeetingSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchedulingRound" ADD CONSTRAINT "SchedulingRound_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingSlot" ADD CONSTRAINT "MeetingSlot_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "SchedulingRound"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotVote" ADD CONSTRAINT "SlotVote_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "MeetingSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotVote" ADD CONSTRAINT "SlotVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
