-- Evidence may now be submitted as an external link (Drive, OneDrive, etc.)
-- instead of an upload, so large media doesn't have to be stored by this
-- system. Such rows carry externalUrl and no filePath.
ALTER TABLE "Document" ALTER COLUMN "filePath" DROP NOT NULL;
ALTER TABLE "Document" ADD COLUMN "externalUrl" TEXT;
