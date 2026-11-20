-- A case carries one show-cause order document. Revisions used to be added
-- alongside the file they replaced, because only an unattached document was
-- swapped out, so the Documents tab listed every superseded draft. Keep the
-- newest per case and drop the rest, detaching them from the attempt that used
-- them first: the attempt keeps its status and the Chairperson's note.
UPDATE "ShowCauseOrder" SET "documentId" = NULL
WHERE "documentId" IN (
  SELECT d."id"
  FROM "Document" d
  WHERE d."docType" = 'SHOW_CAUSE_ORDER'
    AND d."id" NOT IN (
      SELECT DISTINCT ON (k."caseId") k."id"
      FROM "Document" k
      WHERE k."docType" = 'SHOW_CAUSE_ORDER'
      ORDER BY k."caseId", k."uploadedAt" DESC, k."id" DESC
    )
);

DELETE FROM "Document" d
WHERE d."docType" = 'SHOW_CAUSE_ORDER'
  AND d."id" NOT IN (
    SELECT DISTINCT ON (k."caseId") k."id"
    FROM "Document" k
    WHERE k."docType" = 'SHOW_CAUSE_ORDER'
    ORDER BY k."caseId", k."uploadedAt" DESC, k."id" DESC
  );
