-- The Secretariat can return a show-cause response on either ground: the copy
-- could not be confirmed notarized, or its content does not answer the order.
ALTER TABLE "RespondentAnswer" ADD COLUMN "returnedAt" TIMESTAMP(3);
ALTER TABLE "RespondentAnswer" ADD COLUMN "returnedById" TEXT;
ALTER TABLE "RespondentAnswer" ADD COLUMN "returnReason" TEXT;
ALTER TABLE "RespondentAnswer" ADD COLUMN "returnNote" TEXT;
ALTER TABLE "RespondentAnswer"
  ADD CONSTRAINT "RespondentAnswer_returnedById_fkey"
  FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
