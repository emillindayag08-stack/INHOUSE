-- Anonymous complaints: the case flag, and audit entries whose actor is hidden.
ALTER TABLE "Case" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AuditLog" ADD COLUMN "actorHidden" BOOLEAN NOT NULL DEFAULT false;
