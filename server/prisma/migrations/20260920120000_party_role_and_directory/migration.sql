-- Which side of a case someone is on (complainant or respondent) is now a
-- property of the case, not of the account: COMPLAINANT and RESPONDENT
-- collapse into a single PARTY role, Case points at User on both sides, and
-- the Respondent table is dropped. Accounts come from the BulSU directory
-- (User.directoryId), so respondents are real university members rather than
-- auto-provisioned @codi.local logins.
--
-- The database was wiped before this migration (seeded accounts only, zero
-- cases), so this is deliberately destructive and needs no backfill.

-- 1. Recreate RoleName. `ALTER TYPE ... ADD VALUE` is not usable here: Postgres
--    forbids using a newly added enum value in the same transaction, and
--    Prisma wraps this file in one. Recreating the type sidesteps that.
DELETE FROM "User" WHERE "role" IN ('COMPLAINANT', 'RESPONDENT');
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT;
DROP TYPE "RoleName";
CREATE TYPE "RoleName" AS ENUM ('PARTY', 'SECRETARIAT', 'CHAIRPERSON', 'COMMITTEE');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "RoleName" USING "role"::"RoleName";

-- 2. The directory link: a person's student/employee number.
ALTER TABLE "User" ADD COLUMN "directoryId" TEXT;
CREATE UNIQUE INDEX "User_directoryId_key" ON "User"("directoryId");

-- 3. Case.respondentId re-points from Respondent to User.
ALTER TABLE "Case" DROP CONSTRAINT "Case_respondentId_fkey";
ALTER TABLE "Case" ADD CONSTRAINT "Case_respondentId_fkey"
  FOREIGN KEY ("respondentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. What the Respondent row used to denormalize, snapshotted per case.
ALTER TABLE "Case" ADD COLUMN "respondentTypeAtFiling" "RespondentType";
ALTER TABLE "Case" ADD COLUMN "respondentCollegeAtFiling" TEXT;
ALTER TABLE "Case" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- 5. Answers get an author: the Secretariat writes one when proceeding
--    without a response, so "the respondent said this" was not always true.
ALTER TABLE "RespondentAnswer" ADD COLUMN "submittedById" TEXT;
ALTER TABLE "RespondentAnswer" ADD CONSTRAINT "RespondentAnswer_submittedById_fkey"
  FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "Respondent";
