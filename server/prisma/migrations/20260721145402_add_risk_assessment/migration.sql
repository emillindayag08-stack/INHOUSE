-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "evaluatedById" TEXT NOT NULL,
    "severityScore" INTEGER NOT NULL,
    "frequencyScore" INTEGER NOT NULL,
    "evidenceScore" INTEGER NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "classification" "OffenseClassification" NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
