-- Reverses 20260930120000_show_cause_returned. A returned show-cause order now
-- keeps the case at SHOW_CAUSE_PENDING_APPROVAL: it still has to be approved,
-- the Secretariat just has to revise it first, and the order's own status is
-- what records the return. The case status became unreachable, so drop it.
UPDATE "Case" SET "status" = 'SHOW_CAUSE_PENDING_APPROVAL' WHERE "status" = 'SHOW_CAUSE_RETURNED';

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
  'FORMAL_CHARGE_PENDING_APPROVAL',
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
