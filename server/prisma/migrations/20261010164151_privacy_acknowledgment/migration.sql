-- DropForeignKey
ALTER TABLE "Case" DROP CONSTRAINT "Case_respondentId_fkey";

-- AlterTable
ALTER TABLE "LoginAttempt" ADD COLUMN     "privacyAck" JSONB;

-- AlterTable
ALTER TABLE "MfaChallenge" ADD COLUMN     "privacyAck" JSONB;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
