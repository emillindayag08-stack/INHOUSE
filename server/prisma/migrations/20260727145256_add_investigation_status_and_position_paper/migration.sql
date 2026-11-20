-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'POSITION_PAPER';

-- CreateTable
CREATE TABLE "InvestigationStatusUpdate" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestigationStatusUpdate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "InvestigationStatusUpdate" ADD CONSTRAINT "InvestigationStatusUpdate_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationStatusUpdate" ADD CONSTRAINT "InvestigationStatusUpdate_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
