-- An anonymous complaint may meet several Section 12 conditions, not just one.
ALTER TABLE "Case" ADD COLUMN "anonymousGrounds" "AnonymousGround"[];

-- Carry over the single condition chosen on complaints filed so far.
UPDATE "Case" SET "anonymousGrounds" = ARRAY["anonymousGround"] WHERE "anonymousGround" IS NOT NULL;

ALTER TABLE "Case" DROP COLUMN "anonymousGround";
