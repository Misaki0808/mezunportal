-- Kart 116 · Açık şüphe işaretine yeni kanıt: sayaç + son görülme (ekleyici; mevcut satırlar 0/boş ile kalır).
-- Geri alma: ALTER TABLE "SuspicionFlag" DROP COLUMN "recurrenceCount", DROP COLUMN "lastSeenAt",
--                                      DROP COLUMN "seenEvidenceKeys", DROP COLUMN "recentEvidence";
-- Not: `prisma migrate diff` çıktısından türetildi; arama sütunu / GIN / trigram satırı İÇERMEZ (#37 bekçisi).

-- AlterTable
ALTER TABLE "SuspicionFlag" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "recentEvidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "recurrenceCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "seenEvidenceKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];
