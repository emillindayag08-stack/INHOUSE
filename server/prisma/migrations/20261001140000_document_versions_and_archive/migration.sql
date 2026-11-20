-- Documents stop being destroyed. Replacing one used to delete the old row and
-- unlink its file; removing one destroyed it outright. Both are part of the
-- record in a case file, so instead:
--   supersededAt/supersededById  a newer upload took its place; the row stays
--   archivedAt/archivedById/...  withdrawn from the case, with a reason, one-way
-- The case payload filters both out, so a case still shows exactly one current
-- document of each kind.
ALTER TABLE "Document" ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "supersededById" TEXT;
ALTER TABLE "Document" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "archivedById" TEXT;
ALTER TABLE "Document" ADD COLUMN "archiveReason" TEXT;

-- One row can only ever be replaced by one successor, so the chain stays a line.
CREATE UNIQUE INDEX "Document_supersededById_key" ON "Document"("supersededById");
ALTER TABLE "Document" ADD CONSTRAINT "Document_supersededById_fkey"
  FOREIGN KEY ("supersededById") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The Records page lists every file across every case and filters on these.
CREATE INDEX "Document_docType_idx" ON "Document"("docType");
CREATE INDEX "Document_archivedAt_idx" ON "Document"("archivedAt");
CREATE INDEX "Document_uploadedAt_idx" ON "Document"("uploadedAt");
