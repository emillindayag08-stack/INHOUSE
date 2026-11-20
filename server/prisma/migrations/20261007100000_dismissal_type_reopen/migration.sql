-- Dismissal with or without prejudice, and reopening.
CREATE TYPE "DismissalType" AS ENUM ('WITH_PREJUDICE', 'WITHOUT_PREJUDICE');
ALTER TABLE "Case" ADD COLUMN "dismissalType" "DismissalType";
ALTER TABLE "Case" ADD COLUMN "statusBeforeClose" "CaseStatus";
ALTER TABLE "Case" ADD COLUMN "reopenedAt" TIMESTAMP(3);
ALTER TABLE "Case" ADD COLUMN "reopenCount" INTEGER NOT NULL DEFAULT 0;

-- Cases already dismissed were closed before this choice existed: treat them as
-- without prejudice (the reopenable kind) rather than quietly making them final.
UPDATE "Case" SET "dismissalType" = 'WITHOUT_PREJUDICE' WHERE "status" = 'DISMISSED';
