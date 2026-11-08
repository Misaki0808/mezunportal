-- P2-06 · Ters yönlü arama ("staj arıyorum"): yeni rıza belgesi, aday/beyan alanları, talep kaynağı (ekleyici).
-- Geri alma: ALTER TABLE "Profile" DROP COLUMN "seekingInternship", DROP COLUMN "seekingTermYear", DROP COLUMN "seekingTermSeason",
--            DROP COLUMN "seekerRef", DROP COLUMN "seekerViewCount", DROP COLUMN "hiringDeclaredAt";
--            eklenen enum değerleri (ConsentDocument.JOB_SEEKER_VISIBILITY, ContactRequestSource.SEEKER_PROFILE, EventType.JOB_SEEKER_SEARCH)
--            PostgreSQL'de kaldırılamaz; kullanılmayan değer zararsızdır (geri almak için enum yeniden oluşturulur; önce değeri taşıyan satırlar silinir).
-- Not: `prisma migrate diff` çıktısından türetildi (arama sütunu / GIN satırı İÇERMEZ; #37 bekçisi). Yeni enum değerini KULLANAN
-- değişmez bir sonraki migration'dadır (PostgreSQL: yeni değer aynı işlemde kullanılamaz).

-- AlterEnum
ALTER TYPE "ConsentDocument" ADD VALUE 'JOB_SEEKER_VISIBILITY';

-- AlterEnum
ALTER TYPE "ContactRequestSource" ADD VALUE 'SEEKER_PROFILE';

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'JOB_SEEKER_SEARCH';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "hiringDeclaredAt" TIMESTAMP(3),
ADD COLUMN     "seekerRef" TEXT,
ADD COLUMN     "seekerViewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seekingInternship" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seekingTermSeason" "TermSeason",
ADD COLUMN     "seekingTermYear" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Profile_seekerRef_key" ON "Profile"("seekerRef");
