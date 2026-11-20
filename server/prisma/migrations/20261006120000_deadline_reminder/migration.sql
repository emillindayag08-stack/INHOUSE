-- When the "deadline approaching" notice went out, so it is sent once per deadline.
ALTER TABLE "Deadline" ADD COLUMN "reminderSentAt" TIMESTAMP(3);
