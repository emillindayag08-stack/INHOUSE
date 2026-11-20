-- The case becomes the respondent's when the Secretariat serves the show-cause
-- order, not when the Secretariat confirms which account they are.
ALTER TABLE "Case" ADD COLUMN "respondentAssignedAt" TIMESTAMP(3);

-- Cases already served are already assigned: date the assignment from service.
UPDATE "Case" c
   SET "respondentAssignedAt" = o."servedAt"
  FROM "ShowCauseOrder" o
 WHERE o."caseId" = c."id"
   AND o."status" = 'SERVED'
   AND o."servedAt" IS NOT NULL;
