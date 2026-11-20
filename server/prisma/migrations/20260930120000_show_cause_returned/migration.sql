-- A show-cause order the Chairperson sends back leaves the case with the
-- Secretariat to revise, rather than dropping it to VERIFIED as though the
-- complaint had only just been checked.
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
CREATE TYPE "CaseStatus" AS ENUM (
  'SUBMITTED',
  'RETURNED_FOR_CORRECTION',
  'VERIFIED',
  'SHOW_CAUSE_PENDING_APPROVAL',
  'SHOW_CAUSE_RETURNED',
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
