-- Every Committee member now votes on whether a prima facie case exists; the
-- Secretariat confirms the outcome, which is what records the official
-- PrimaFacieEvaluation. One vote per member per case — re-voting updates it.
CREATE TABLE "PrimaFacieVote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "rationale" TEXT NOT NULL,
    "votedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrimaFacieVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrimaFacieVote_caseId_voterId_key" ON "PrimaFacieVote"("caseId", "voterId");

ALTER TABLE "PrimaFacieVote" ADD CONSTRAINT "PrimaFacieVote_caseId_fkey"
  FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PrimaFacieVote" ADD CONSTRAINT "PrimaFacieVote_voterId_fkey"
  FOREIGN KEY ("voterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
