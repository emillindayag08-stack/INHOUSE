-- Student vs Faculty/Personnel distinction on User, collected at
-- self-registration. Reuses the existing RespondentType enum.
ALTER TABLE "User" ADD COLUMN "userType" "RespondentType";
