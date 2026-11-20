-- AlterTable: Hearing gains explicit flags for whether a document is
-- required from each party for this hearing, set alongside the existing
-- per-party guidance notes. Additive, defaulted to false, safe for existing
-- rows.
ALTER TABLE "Hearing" ADD COLUMN "requiresDocFromComplainant" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Hearing" ADD COLUMN "requiresDocFromRespondent" BOOLEAN NOT NULL DEFAULT false;
