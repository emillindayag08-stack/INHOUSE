-- The respondent's response to a show-cause order is now held for the
-- Secretariat: they confirm it is notarized, then approve it, and only that
-- approval moves the case on.
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
CREATE TYPE "CaseStatus" AS ENUM (
  'SUBMITTED',
  'RETURNED_FOR_CORRECTION',
  'VERIFIED',
  'SHOW_CAUSE_PENDING_APPROVAL',
  'SHOW_CAUSE_APPROVED',
  'SHOW_CAUSE_ISSUED',
  'ANSWER_UNDER_REVIEW',
  'ANSWER_SUBMITTED',
  'UNDER_EVALUATION',
  'PRIMA_FACIE_FOUND',
  'PRIMA_FACIE_NOT_FOUND',
  'FORMAL_CHARGE_ISSUED',
  'HEARING_SCHEDULED',
  'FORMAL_INVESTIGATION_ENDED',
  'DELIBERATION',
  'DECIDED',
  'DISMISSED',
  'RESOLVED',
  'ESCALATED'
);
ALTER TABLE "Case" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Case" ALTER COLUMN "status" TYPE "CaseStatus" USING ("status"::text::"CaseStatus");
ALTER TABLE "Case" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';
DROP TYPE "CaseStatus_old";
