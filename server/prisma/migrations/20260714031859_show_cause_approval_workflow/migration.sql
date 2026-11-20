-- CreateEnum
CREATE TYPE "ShowCauseOrderStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'RETURNED');

-- AlterEnum
ALTER TYPE "CaseStatus" ADD VALUE 'SHOW_CAUSE_PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "ShowCauseOrder" ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "status" "ShowCauseOrderStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
ALTER COLUMN "responseDeadline" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "ShowCauseOrder" ADD CONSTRAINT "ShowCauseOrder_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
