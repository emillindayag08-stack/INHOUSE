-- The formal charge is drafted outside the system and attached as a file, the
-- same way the show-cause order is. Pin the draft to the attempt it was sent up
-- with, so an unpinned FORMAL_CHARGE document reads as a working copy the
-- Secretariat may still replace.
ALTER TABLE "FormalCharge" ADD COLUMN "documentId" TEXT;
CREATE UNIQUE INDEX "FormalCharge_documentId_key" ON "FormalCharge"("documentId");
ALTER TABLE "FormalCharge" ADD CONSTRAINT "FormalCharge_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
