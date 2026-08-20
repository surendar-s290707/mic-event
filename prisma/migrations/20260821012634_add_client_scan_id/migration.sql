-- AlterTable
ALTER TABLE "CheckIn" ADD COLUMN     "clientScanId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CheckIn_clientScanId_key" ON "CheckIn"("clientScanId");

