-- Only what a party files goes to the Secretariat for approval. CODI's own
-- attachments and evidence are on the case record as filed, so rows written
-- before the review existed are marked approved rather than left looking like
-- they are waiting on someone.
UPDATE "Document"
   SET "reviewStatus" = 'APPROVED'
 WHERE "reviewStatus" = 'PENDING'
   AND "docType" NOT IN ('COMPLAINT', 'SHOW_CAUSE_ANSWER', 'RESPONDENT_ANSWER', 'POSITION_PAPER');
