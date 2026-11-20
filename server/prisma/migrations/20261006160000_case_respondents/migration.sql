-- A case can name up to three respondents. CaseRespondent holds each one; the
-- first stays mirrored on Case so existing reads keep working.
ALTER TABLE "Document" ADD COLUMN "respondentRowId" TEXT;
ALTER TABLE "Deadline" ADD COLUMN "respondentRowId" TEXT;
ALTER TABLE "RespondentAnswer" ADD COLUMN "respondentRowId" TEXT;

CREATE TABLE "CaseRespondent" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "userId" TEXT,
    "claimedName" TEXT NOT NULL,
    "claimedType" "RespondentType" NOT NULL,
    "claimedCollege" TEXT NOT NULL,
    "typeAtFiling" "RespondentType",
    "collegeAtFiling" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "assignedAt" TIMESTAMP(3),
    "pathwayChoice" "InvestigationPathway",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseRespondent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CaseRespondent_caseId_position_key" ON "CaseRespondent"("caseId", "position");
CREATE INDEX "CaseRespondent_userId_idx" ON "CaseRespondent"("userId");

ALTER TABLE "CaseRespondent" ADD CONSTRAINT "CaseRespondent_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CaseRespondent" ADD CONSTRAINT "CaseRespondent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CaseRespondent" ADD CONSTRAINT "CaseRespondent_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every existing case becomes a case with one respondent (position 0).
INSERT INTO "CaseRespondent" (
    "id", "caseId", "position", "userId", "claimedName", "claimedType", "claimedCollege",
    "typeAtFiling", "collegeAtFiling", "confirmedAt", "confirmedById", "assignedAt", "pathwayChoice"
)
SELECT
    'cr_' || c."id", c."id", 0, c."respondentId",
    COALESCE(c."claimedRespondentName", ''),
    COALESCE(c."claimedRespondentType", 'STUDENT'),
    COALESCE(c."claimedRespondentCollege", ''),
    c."respondentTypeAtFiling", c."respondentCollegeAtFiling",
    c."respondentConfirmedAt", c."respondentConfirmedById", c."respondentAssignedAt",
    c."respondentPathwayChoice"
FROM "Case" c
ON CONFLICT DO NOTHING;

-- What that respondent has already filed belongs to their row.
UPDATE "Document" d SET "respondentRowId" = 'cr_' || d."caseId"
FROM "Case" c
WHERE c."id" = d."caseId" AND c."respondentId" IS NOT NULL AND d."uploadedById" = c."respondentId"
  AND d."docType" IN ('RESPONDENT_ANSWER', 'SHOW_CAUSE_ANSWER', 'POSITION_PAPER');

UPDATE "RespondentAnswer" a SET "respondentRowId" = 'cr_' || a."caseId"
FROM "Case" c
WHERE c."id" = a."caseId" AND c."respondentId" IS NOT NULL AND a."submittedById" = c."respondentId";

UPDATE "Deadline" SET "respondentRowId" = 'cr_' || "caseId" WHERE "stage" LIKE 'RESPONDENT RESPONSE%';
