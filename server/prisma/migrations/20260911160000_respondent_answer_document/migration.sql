-- The formal written answer to the formal charge is now attached as a
-- notarized document (docType RESPONDENT_ANSWER) rather than typed, so its
-- content column is no longer required. Show-cause-stage answers still use it.
ALTER TABLE "RespondentAnswer" ALTER COLUMN "content" DROP NOT NULL;
