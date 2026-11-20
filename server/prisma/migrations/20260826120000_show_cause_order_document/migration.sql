-- The show-cause order is now attached as a signed document rather than
-- transcribed into a text field. ADD VALUE is safe inside this transaction
-- because the new enum value is not referenced by any statement below it.
ALTER TYPE "DocumentType" ADD VALUE 'SHOW_CAUSE_ORDER';

-- Orders drafted before this change keep their transcribed text; new ones
-- leave it null and carry the file instead.
ALTER TABLE "ShowCauseOrder" ALTER COLUMN "content" DROP NOT NULL;

-- One document per order (not per case), so a draft returned for revision
-- keeps the exact file that was submitted for it.
ALTER TABLE "ShowCauseOrder" ADD COLUMN "documentId" TEXT;
CREATE UNIQUE INDEX "ShowCauseOrder_documentId_key" ON "ShowCauseOrder"("documentId");
ALTER TABLE "ShowCauseOrder" ADD CONSTRAINT "ShowCauseOrder_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
