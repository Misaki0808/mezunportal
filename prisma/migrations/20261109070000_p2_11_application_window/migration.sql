-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'APPLICATION_WINDOW';

-- AlterTable
ALTER TABLE "Experience" ADD COLUMN     "appliedMonth" INTEGER;

-- CreateTable
CREATE TABLE "CompanyFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "sectorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyFollow_companyId_idx" ON "CompanyFollow"("companyId");

-- CreateIndex
CREATE INDEX "CompanyFollow_sectorId_idx" ON "CompanyFollow"("sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFollow_userId_companyId_key" ON "CompanyFollow"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFollow_userId_sectorId_key" ON "CompanyFollow"("userId", "sectorId");

-- AddForeignKey
ALTER TABLE "CompanyFollow" ADD CONSTRAINT "CompanyFollow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFollow" ADD CONSTRAINT "CompanyFollow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFollow" ADD CONSTRAINT "CompanyFollow_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Başvuru ayı ve takip hedefi DB düzeyinde de sınırlanır.
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_appliedMonth_check" CHECK ("appliedMonth" IS NULL OR ("type" = 'INTERNSHIP' AND "appliedMonth" BETWEEN 1 AND 12));
ALTER TABLE "CompanyFollow" ADD CONSTRAINT "CompanyFollow_target_check" CHECK (("companyId" IS NOT NULL)::int + ("sectorId" IS NOT NULL)::int = 1);
