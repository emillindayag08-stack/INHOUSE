-- Every sign-in attempt, successful or failed.
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");
CREATE INDEX "LoginAttempt_email_idx" ON "LoginAttempt"("email");
CREATE INDEX "LoginAttempt_success_idx" ON "LoginAttempt"("success");

ALTER TABLE "LoginAttempt" ADD CONSTRAINT "LoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
