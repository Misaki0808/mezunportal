-- P2-04 (D7) · İletişim talebinin kaynağı: ilan kaynaklı talepte hedefin kimliği/adı onaydan önce açılmaz (ekleyici; mevcut satırlar PROFILE olur).
-- Geri alma: ALTER TABLE "ContactRequest" DROP CONSTRAINT "ContactRequest_source_check", DROP CONSTRAINT "ContactRequest_jobPostingId_fkey",
--            DROP COLUMN "jobPostingId", DROP COLUMN "source", DROP COLUMN "sourceTitle", DROP COLUMN "sourceOrganization"; DROP TYPE "ContactRequestSource";
-- Not: `prisma migrate diff` çıktısından türetildi (arama sütunu / GIN satırı İÇERMEZ; #37 bekçisi).

-- CreateEnum
CREATE TYPE "ContactRequestSource" AS ENUM ('PROFILE', 'JOB_POSTING');

-- AlterTable
ALTER TABLE "ContactRequest" ADD COLUMN     "jobPostingId" TEXT,
ADD COLUMN     "source" "ContactRequestSource" NOT NULL DEFAULT 'PROFILE',
ADD COLUMN     "sourceOrganization" TEXT,
ADD COLUMN     "sourceTitle" TEXT;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ContactRequest_jobPostingId_idx" ON "ContactRequest"("jobPostingId");

-- Değişmez: PROFILE kaynaklı talep ilan izi taşımaz; JOB_POSTING kaynaklı talep başlık ve kurum özetini taşır (`jobPostingId` ilan silinince
-- NULL olabilir; özet kalır, böylece ilan silinse/kapansa da talep eden hedefin kimliğini görmez).
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_source_check" CHECK (
  ("source" = 'PROFILE' AND "jobPostingId" IS NULL AND "sourceTitle" IS NULL AND "sourceOrganization" IS NULL)
  OR ("source" = 'JOB_POSTING' AND "sourceTitle" IS NOT NULL AND "sourceOrganization" IS NOT NULL
    AND char_length(btrim("sourceTitle")) BETWEEN 1 AND 200 AND char_length(btrim("sourceOrganization")) BETWEEN 1 AND 200)
);
