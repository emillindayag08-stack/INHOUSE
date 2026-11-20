-- A verified complaint gets a CPI number (REF at filing, CPI when verified, CODI at prima facie).
ALTER TABLE "Case" ADD COLUMN "cpiNumber" TEXT;
CREATE UNIQUE INDEX "Case_cpiNumber_key" ON "Case"("cpiNumber");
