-- A complainant now describes the respondent in their own words (name,
-- status, college) and may optionally point at a directory account. The
-- Secretariat confirms who that person actually is before the complaint can
-- be verified, so a case exists for a while with no account attached.

ALTER TABLE "Case" ALTER COLUMN "respondentId" DROP NOT NULL;

ALTER TABLE "Case" ADD COLUMN "claimedRespondentName" TEXT;
ALTER TABLE "Case" ADD COLUMN "claimedRespondentType" "RespondentType";
ALTER TABLE "Case" ADD COLUMN "claimedRespondentCollege" TEXT;
ALTER TABLE "Case" ADD COLUMN "respondentConfirmedAt" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN "respondentConfirmedById" TEXT;

ALTER TABLE "Case" ADD CONSTRAINT "Case_respondentConfirmedById_fkey"
  FOREIGN KEY ("respondentConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing cases already point at an account, so they count as confirmed;
-- their claimed details are backfilled from that account so the Secretariat's
-- view of them isn't blank.
UPDATE "Case" c
SET "claimedRespondentName" = u."fullName",
    "claimedRespondentType" = COALESCE(c."respondentTypeAtFiling", u."userType"),
    "claimedRespondentCollege" = COALESCE(c."respondentCollegeAtFiling", u."department"),
    "respondentConfirmedAt" = c."filedAt"
FROM "User" u
WHERE u."id" = c."respondentId";
