-- AlterTable: Case gains a referenceNumber (REF-YYYY-NNNN), assigned to every
-- case unconditionally at submission (see POST /cases in cases.routes.js).
-- caseNumber (CODI-YYYY-NNNN) is now assigned only once a prima facie case is
-- found (see POST /:id/prima-facie), so it becomes optional — cases dismissed
-- at or before prima facie keep only their reference number, permanently.
-- Postgres unique indexes treat NULL as distinct from every other value, so a
-- nullable + unique caseNumber is safe even with many NULL rows.
--
-- No backfill: this is a dev-only capstone project whose data is routinely
-- wiped and reseeded (see prisma/wipe.js + prisma/seed.js) rather than
-- migrated forward with existing rows. The Case table is assumed EMPTY when
-- this migration runs — run `node prisma/wipe.js` first if it isn't, since
-- ADD COLUMN ... NOT NULL below has no DEFAULT and will fail on existing rows.
ALTER TABLE "Case" ALTER COLUMN "caseNumber" DROP NOT NULL;
ALTER TABLE "Case" ADD COLUMN "referenceNumber" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Case_referenceNumber_key" ON "Case"("referenceNumber");
