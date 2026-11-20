-- CreateEnum
CREATE TYPE "InvestigationPathway" AS ENUM ('FORMAL_INVESTIGATION', 'POSITION_PAPER');

-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "complainantPathwayChoice" "InvestigationPathway",
ADD COLUMN     "complainantPathwayChosenAt" TIMESTAMP(3),
ADD COLUMN     "finalPathway" "InvestigationPathway",
ADD COLUMN     "pathwayRecommendedAt" TIMESTAMP(3),
ADD COLUMN     "pathwayRecommendedById" TEXT,
ADD COLUMN     "respondentPathwayChoice" "InvestigationPathway";

-- AlterTable
ALTER TABLE "RespondentAnswer" ADD COLUMN     "stage" TEXT NOT NULL DEFAULT 'SHOW_CAUSE';

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_pathwayRecommendedById_fkey" FOREIGN KEY ("pathwayRecommendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
