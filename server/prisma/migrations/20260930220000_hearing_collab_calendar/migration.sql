-- Hearings can be agreed on the collab calendar too: the Secretariat proposes
-- candidate times, the Committee and Chairperson mark availability, and the
-- confirmed slot becomes the Hearing. Existing rounds were all for the
-- Committee meeting, which the default covers.
CREATE TYPE "SchedulingPurpose" AS ENUM ('COMMITTEE_MEETING', 'HEARING');

ALTER TABLE "SchedulingRound" ADD COLUMN "purpose" "SchedulingPurpose" NOT NULL DEFAULT 'COMMITTEE_MEETING';
ALTER TABLE "SchedulingRound" ADD COLUMN "hearingId" TEXT;
CREATE UNIQUE INDEX "SchedulingRound_hearingId_key" ON "SchedulingRound"("hearingId");
ALTER TABLE "SchedulingRound" ADD CONSTRAINT "SchedulingRound_hearingId_fkey"
  FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
