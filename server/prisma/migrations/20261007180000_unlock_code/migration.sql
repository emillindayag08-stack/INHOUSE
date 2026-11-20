-- A locked account can be unlocked at once with a code sent by email.
ALTER TABLE "User" ADD COLUMN "unlockCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "unlockCodeExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "unlockAttempts" INTEGER NOT NULL DEFAULT 0;
