-- Two-step sign-in for staff: emailed one-time codes, and trusted devices.
CREATE TABLE "MfaChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MfaChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MfaChallenge_userId_createdAt_idx" ON "MfaChallenge"("userId", "createdAt");
ALTER TABLE "MfaChallenge" ADD CONSTRAINT "MfaChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
