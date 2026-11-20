-- Deactivating an account (a Committee member who resigns or is replaced).
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deactivatedById" TEXT;
ALTER TABLE "User" ADD COLUMN "deactivationNote" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
