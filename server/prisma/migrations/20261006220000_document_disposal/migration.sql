-- Retention: disposal needs the Secretariat's recorded approval.
ALTER TABLE "Document" ADD COLUMN "disposalApprovedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "disposalApprovedById" TEXT;
ALTER TABLE "Document" ADD COLUMN "disposalNote" TEXT;
CREATE INDEX "Document_disposalApprovedAt_idx" ON "Document"("disposalApprovedAt");
ALTER TABLE "Document" ADD CONSTRAINT "Document_disposalApprovedById_fkey" FOREIGN KEY ("disposalApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
