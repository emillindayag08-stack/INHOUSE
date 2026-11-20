-- AlterEnum
-- No existing Decision rows use the old values (verified before writing this
-- migration), so the USING cast below is a no-op on data.
BEGIN;
CREATE TYPE "DecisionOutcome_new" AS ENUM ('LIABLE', 'NOT_LIABLE');
ALTER TABLE "Decision" ALTER COLUMN "outcome" TYPE "DecisionOutcome_new" USING ("outcome"::text::"DecisionOutcome_new");
ALTER TYPE "DecisionOutcome" RENAME TO "DecisionOutcome_old";
ALTER TYPE "DecisionOutcome_new" RENAME TO "DecisionOutcome";
DROP TYPE "DecisionOutcome_old";
COMMIT;
