-- CreateEnum
CREATE TYPE "AnonymousGround" AS ENUM ('PUBLIC_KNOWLEDGE', 'VERIFIABLE', 'DOCUMENTARY_EVIDENCE', 'AGENCY_REFERRAL');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "anonymousGround" "AnonymousGround",
ADD COLUMN     "falseComplaintAckAt" TIMESTAMP(3),
ADD COLUMN     "incidentDate" TIMESTAMP(3),
ADD COLUMN     "incidentPlace" TEXT,
ADD COLUMN     "notEntertainedAt" TIMESTAMP(3),
ADD COLUMN     "notEntertainedReason" TEXT;

