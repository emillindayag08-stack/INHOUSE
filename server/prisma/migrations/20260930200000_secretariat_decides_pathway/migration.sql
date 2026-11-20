-- The pathway is the Secretariat's to set, even when both parties asked for the
-- same one. Cases used to resolve themselves the moment the two choices
-- matched, which took the decision away before anyone made it. Hand back the
-- ones that were settled that way: no Secretariat on the record
-- (pathwayRecommendedById IS NULL) and nothing downstream depending on it yet.
UPDATE "Case" c
SET "finalPathway" = NULL
WHERE c."finalPathway" IS NOT NULL
  AND c."pathwayRecommendedById" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Hearing" h WHERE h."caseId" = c."id")
  AND NOT EXISTS (SELECT 1 FROM "Deliberation" d WHERE d."caseId" = c."id");
