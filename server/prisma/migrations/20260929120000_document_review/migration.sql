-- A submitted document is no longer described by its notarization alone: it is
-- either waiting for the Secretariat, approved onto the case record, or sent
-- back with a note saying what to fix.
ALTER TYPE "NotarizationStatus" RENAME TO "DocumentReviewStatus";
ALTER TYPE "DocumentReviewStatus" RENAME VALUE 'NOTARIZED' TO 'APPROVED';
ALTER TYPE "DocumentReviewStatus" RENAME VALUE 'NOT_NOTARIZED' TO 'RETURNED';

ALTER TABLE "Document" RENAME COLUMN "notarizationStatus" TO "reviewStatus";
ALTER TABLE "Document" RENAME COLUMN "notarizedById" TO "reviewedById";
ALTER TABLE "Document" RENAME COLUMN "notarizedAt" TO "reviewedAt";
ALTER TABLE "Document" ADD COLUMN "reviewNote" TEXT;
