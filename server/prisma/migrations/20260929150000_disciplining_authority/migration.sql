-- The University President gets an account: they approve the formal charge CODI
-- drafts, and decide the case's outcome.

-- Both enums are recreated rather than extended: Prisma runs a migration in a
-- transaction, and Postgres refuses ALTER TYPE ... ADD VALUE inside one. The
-- new case status also belongs in sequence rather than at the end.
ALTER TYPE "RoleName" RENAME TO "RoleName_old";
CREATE TYPE "RoleName" AS ENUM ('PARTY', 'SECRETARIAT', 'CHAIRPERSON', 'COMMITTEE', 'DISCIPLINING_AUTHORITY');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "RoleName" USING ("role"::text::"RoleName");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'PARTY';
DROP TYPE "RoleName_old";

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

-- A drafted charge now waits on the Authority before it is issued.
CREATE TYPE "FormalChargeStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'RETURNED');
ALTER TABLE "FormalCharge" ADD COLUMN "status" "FormalChargeStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';
ALTER TABLE "FormalCharge" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "FormalCharge" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "FormalCharge" ADD COLUMN "returnNote" TEXT;
ALTER TABLE "FormalCharge"
  ADD CONSTRAINT "FormalCharge_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Charges recorded before this existed were already issued.
UPDATE "FormalCharge" SET "status" = 'APPROVED';
