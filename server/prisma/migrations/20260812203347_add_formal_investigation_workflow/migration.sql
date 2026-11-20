-- AlterEnum: new CaseStatus value for the Formal Investigation pathway's
-- "hearings ended, awaiting recommendation" stage, and a new DocumentType
-- for the Secretariat's final recommendation attachment.
ALTER TYPE "CaseStatus" ADD VALUE 'FORMAL_INVESTIGATION_ENDED';
ALTER TYPE "DocumentType" ADD VALUE 'RECOMMENDATION';

-- CreateEnum
CREATE TYPE "HearingType" AS ENUM ('PRE_TRIAL', 'TRIAL');

-- AlterTable: Hearing gains a type (Pre-Trial vs repeatable Trial),
-- per-party guidance notes, and attribution for who scheduled it. Hearing
-- has 0 existing rows (verified before this migration), so these are safe
-- additive columns with no backfill needed.
ALTER TABLE "Hearing" ADD COLUMN "type" "HearingType" NOT NULL DEFAULT 'TRIAL';
ALTER TABLE "Hearing" ADD COLUMN "noteForComplainant" TEXT;
ALTER TABLE "Hearing" ADD COLUMN "noteForRespondent" TEXT;
ALTER TABLE "Hearing" ADD COLUMN "scheduledById" TEXT;

-- AlterTable: Document gains an optional link to the Hearing it was
-- submitted for (set on EVIDENCE documents a party uploads in response to
-- a hearing note, and on the RECOMMENDATION document).
ALTER TABLE "Document" ADD COLUMN "hearingId" TEXT;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_scheduledById_fkey" FOREIGN KEY ("scheduledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_hearingId_fkey" FOREIGN KEY ("hearingId") REFERENCES "Hearing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
