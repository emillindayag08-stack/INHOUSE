-- CreateEnum
CREATE TYPE "NotarizationStatus" AS ENUM ('PENDING', 'NOTARIZED', 'NOT_NOTARIZED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "notarizationStatus" "NotarizationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "notarizedAt" TIMESTAMP(3),
ADD COLUMN     "notarizedById" TEXT;
