-- Committee members now vote an offense level directly instead of scoring
-- severity, frequency and evidence. Older assessments keep their scores.
ALTER TABLE "RiskAssessment" ALTER COLUMN "severityScore" DROP NOT NULL;
ALTER TABLE "RiskAssessment" ALTER COLUMN "frequencyScore" DROP NOT NULL;
ALTER TABLE "RiskAssessment" ALTER COLUMN "evidenceScore" DROP NOT NULL;
ALTER TABLE "RiskAssessment" ALTER COLUMN "totalScore" DROP NOT NULL;
