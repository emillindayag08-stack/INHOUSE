-- The response to a show-cause order is now a notarized document the
-- respondent uploads, reviewed by the Secretariat like the complaint, rather
-- than text typed into the case page.
ALTER TYPE "DocumentType" RENAME TO "DocumentType_old";
CREATE TYPE "DocumentType" AS ENUM (
  'COMPLAINT',
  'EVIDENCE',
  'RESPONDENT_ANSWER',
  'SHOW_CAUSE_ANSWER',
  'DELIBERATION_NOTES',
  'DECISION',
  'OTHER',
  'POSITION_PAPER',
  'RECOMMENDATION',
  'HEARING_MINUTES',
  'FORMAL_CHARGE',
  'SHOW_CAUSE_ORDER'
);
ALTER TABLE "Document" ALTER COLUMN "docType" TYPE "DocumentType" USING ("docType"::text::"DocumentType");
DROP TYPE "DocumentType_old";
