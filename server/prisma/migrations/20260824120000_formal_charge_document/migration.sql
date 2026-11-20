-- The formal charge is now attached as a document rather than transcribed
-- into a text field. ADD VALUE is safe inside this transaction because the
-- new enum value is not referenced by any statement below it.
ALTER TYPE "DocumentType" ADD VALUE 'FORMAL_CHARGE';

-- Existing charges keep their transcribed text; new ones leave it null.
ALTER TABLE "FormalCharge" ALTER COLUMN "chargeDetails" DROP NOT NULL;
