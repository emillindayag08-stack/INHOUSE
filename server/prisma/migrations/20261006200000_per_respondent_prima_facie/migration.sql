-- Each respondent gets their own prima facie vote, finding and risk assessment.
ALTER TABLE "PrimaFacieVote" ADD COLUMN "respondentRowId" TEXT;
ALTER TABLE "PrimaFacieEvaluation" ADD COLUMN "respondentRowId" TEXT;
ALTER TABLE "RiskAssessment" ADD COLUMN "respondentRowId" TEXT;
ALTER TABLE "CaseRespondent" ADD COLUMN "primaFacieFound" BOOLEAN;
ALTER TABLE "CaseRespondent" ADD COLUMN "offenseClassification" "OffenseClassification";

DROP INDEX "PrimaFacieVote_caseId_voterId_key";
CREATE UNIQUE INDEX "PrimaFacieVote_caseId_voterId_respondentRowId_key" ON "PrimaFacieVote"("caseId", "voterId", "respondentRowId");

-- Everything recorded so far was about the case's one respondent.
UPDATE "PrimaFacieVote" v SET "respondentRowId" = 'cr_' || v."caseId";
UPDATE "PrimaFacieEvaluation" e SET "respondentRowId" = 'cr_' || e."caseId";
UPDATE "RiskAssessment" r SET "respondentRowId" = 'cr_' || r."caseId";
UPDATE "CaseRespondent" cr SET
    "offenseClassification" = c."offenseClassification",
    "primaFacieFound" = (SELECT e."found" FROM "PrimaFacieEvaluation" e WHERE e."caseId" = c."id" ORDER BY e."evaluatedAt" DESC LIMIT 1)
FROM "Case" c
WHERE c."id" = cr."caseId" AND cr."position" = 0;
