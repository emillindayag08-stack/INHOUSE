-- AlterTable
ALTER TABLE "RiskAssessment" ADD COLUMN     "overriddenAt" TIMESTAMP(3),
ADD COLUMN     "overriddenById" TEXT,
ADD COLUMN     "overrideClassification" "OffenseClassification",
ADD COLUMN     "overrideJustification" TEXT;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
