-- Lock an account for an hour after three wrong passwords in a row.
ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);
