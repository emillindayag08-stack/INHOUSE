-- The Chairperson's approval no longer reaches the respondent by itself: the
-- approved order goes back to the Secretariat, who serves it. Service is what
-- puts the order in force and starts the response window.

-- Postgres cannot ADD VALUE inside a transaction, and the new case status
-- belongs in sequence rather than at the end, so both enums are recreated.
ALTER TYPE "CaseStatus" RENAME TO "CaseStatus_old";
CREATE TYPE "CaseStatus" AS ENUM (
  'SUBMITTED',
  'RETURNED_FOR_CORRECTION',
  'VERIFIED',
  'SHOW_CAUSE_PENDING_APPROVAL',
  'SHOW_CAUSE_APPROVED',
  'SHOW_CAUSE_ISSUED',
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

ALTER TYPE "ShowCauseOrderStatus" RENAME TO "ShowCauseOrderStatus_old";
CREATE TYPE "ShowCauseOrderStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'SERVED', 'RETURNED');
ALTER TABLE "ShowCauseOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ShowCauseOrder" ALTER COLUMN "status" TYPE "ShowCauseOrderStatus" USING ("status"::text::"ShowCauseOrderStatus");
ALTER TABLE "ShowCauseOrder" ALTER COLUMN "status" SET DEFAULT 'PENDING_APPROVAL';
DROP TYPE "ShowCauseOrderStatus_old";

ALTER TABLE "ShowCauseOrder" ADD COLUMN "servedById" TEXT;
ALTER TABLE "ShowCauseOrder" ADD COLUMN "servedAt" TIMESTAMP(3);
ALTER TABLE "ShowCauseOrder"
  ADD CONSTRAINT "ShowCauseOrder_servedById_fkey"
  FOREIGN KEY ("servedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Orders approved before this change were issued to the respondent the moment
-- the Chairperson approved them, so they are already served: credit the
-- service to the Secretariat member who drafted them, at the approval time.
UPDATE "ShowCauseOrder"
   SET "status" = 'SERVED',
       "servedAt" = COALESCE("reviewedAt", "issuedAt"),
       "servedById" = "issuedById"
 WHERE "status" = 'APPROVED';
