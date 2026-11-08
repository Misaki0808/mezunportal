-- P2-04 · Mezun staj/iş ilanları: JobPosting, JobPostingDepartment, JobPostingReport + yeni enum değerleri (ekleyici;
-- mevcut tabloya dokunmaz, yalnız enum değeri ekler).
-- Geri alma: DROP TABLE "JobPostingReport", "JobPostingDepartment", "JobPosting"; DROP TYPE "JobApplyMethod", "JobPostingKind",
--            "JobPostingStatus"; eklenen enum değerleri (NotificationType.JOB_POSTING, EventType.JOB_POSTING_*,
--            PointAction.JOB_POSTING_PUBLISHED, PointSourceType.JOB_POSTING, PointRevokeReason.POSTING_WITHDRAWN) PostgreSQL'de
--            kaldırılamaz; kullanılmayan değer zararsızdır (geri almak için ilgili enum yeniden oluşturulur; önce o değeri
--            taşıyan satırlar silinir).
-- Not: `prisma migrate diff` çıktısından türetildi; üretilmiş arama sütunları ve GIN indeksleri aşağıda ham SQL ile eklenir
-- (şemada `dbgenerated()` ile modellidir; docs/decisions.md "Üretilmiş arama sütunları").

-- CreateEnum
CREATE TYPE "JobPostingStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "JobPostingKind" AS ENUM ('INTERNSHIP', 'JOB');

-- CreateEnum
CREATE TYPE "JobApplyMethod" AS ENUM ('URL', 'CONTACT_REQUEST');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'JOB_POSTING';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'JOB_POSTING_PUBLISHED';
ALTER TYPE "EventType" ADD VALUE 'JOB_POSTING_VIEWED';
ALTER TYPE "EventType" ADD VALUE 'JOB_POSTING_SEARCH';

-- AlterEnum
ALTER TYPE "PointAction" ADD VALUE 'JOB_POSTING_PUBLISHED';

-- AlterEnum
ALTER TYPE "PointSourceType" ADD VALUE 'JOB_POSTING';

-- AlterEnum
ALTER TYPE "PointRevokeReason" ADD VALUE 'POSTING_WITHDRAWN';

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "departmentIdAtWrite" TEXT NOT NULL,
    "kind" "JobPostingKind" NOT NULL DEFAULT 'INTERNSHIP',
    "title" TEXT,
    "companyId" TEXT,
    "organizationName" TEXT,
    "location" TEXT,
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "applyMethod" "JobApplyMethod",
    "applyUrl" TEXT,
    "deadlineOn" DATE,
    "status" "JobPostingStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "moderationNote" TEXT,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPostingDepartment" (
    "postingId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "JobPostingDepartment_pkey" PRIMARY KEY ("postingId","departmentId")
);

-- CreateTable
CREATE TABLE "JobPostingReport" (
    "id" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPostingReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPosting_authorId_updatedAt_idx" ON "JobPosting"("authorId", "updatedAt");

-- CreateIndex
CREATE INDEX "JobPosting_departmentIdAtWrite_status_createdAt_idx" ON "JobPosting"("departmentIdAtWrite", "status", "createdAt");

-- CreateIndex
CREATE INDEX "JobPosting_status_publishedAt_id_idx" ON "JobPosting"("status", "publishedAt" DESC, "id");

-- CreateIndex
CREATE INDEX "JobPosting_status_deadlineOn_idx" ON "JobPosting"("status", "deadlineOn");

-- CreateIndex
CREATE INDEX "JobPostingDepartment_departmentId_idx" ON "JobPostingDepartment"("departmentId");

-- CreateIndex
CREATE INDEX "JobPostingReport_postingId_status_idx" ON "JobPostingReport"("postingId", "status");

-- CreateIndex
CREATE INDEX "JobPostingReport_status_createdAt_idx" ON "JobPostingReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "JobPostingReport_reporterId_idx" ON "JobPostingReport"("reporterId");

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_departmentIdAtWrite_fkey" FOREIGN KEY ("departmentIdAtWrite") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPostingDepartment" ADD CONSTRAINT "JobPostingDepartment_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPostingDepartment" ADD CONSTRAINT "JobPostingDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPostingReport" ADD CONSTRAINT "JobPostingReport_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPostingReport" ADD CONSTRAINT "JobPostingReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPostingReport" ADD CONSTRAINT "JobPostingReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Üretilmiş arama sütunları (Experience/FaqItem ile aynı kural): başlık ve kurum A, konum B, açıklama C ağırlığında; her alan hem
-- tr-TR küçük harf + Türkçe gövdeleme hem ASCII katlanmış basit sözlükle indekslenir. `searchKeys`: yazım hatası için başlık + kurum (pg_trgm).
ALTER TABLE "JobPosting" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('turkish', "tr_lower"(coalesce("title", '') || ' ' || coalesce("organizationName", ''))), 'A')
  || setweight(to_tsvector('simple', "tr_ascii"(coalesce("title", '') || ' ' || coalesce("organizationName", ''))), 'A')
  || setweight(to_tsvector('turkish', "tr_lower"(coalesce("location", ''))), 'B')
  || setweight(to_tsvector('simple', "tr_ascii"(coalesce("location", ''))), 'B')
  || setweight(to_tsvector('turkish', "tr_lower"(coalesce("description", ''))), 'C')
  || setweight(to_tsvector('simple', "tr_ascii"(coalesce("description", ''))), 'C')
) STORED;
ALTER TABLE "JobPosting" ADD COLUMN "searchKeys" text GENERATED ALWAYS AS (
  "tr_ascii"(coalesce("title", '') || ' ' || coalesce("organizationName", ''))
) STORED;
CREATE INDEX "JobPosting_searchVector_idx" ON "JobPosting" USING gin ("searchVector");
CREATE INDEX "JobPosting_searchKeys_trgm" ON "JobPosting" USING gin ("searchKeys" gin_trgm_ops);

-- Değişmezler (ham SQL; Prisma şeması ifade edemez):
-- 1) Metin sınırları (sunucu Zod'u da aynı sınırı uygular).
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_bounds_check" CHECK (
  ("title" IS NULL OR char_length(btrim("title")) BETWEEN 3 AND 120)
  AND ("organizationName" IS NULL OR char_length(btrim("organizationName")) BETWEEN 2 AND 120)
  AND ("location" IS NULL OR char_length(btrim("location")) BETWEEN 2 AND 100)
  AND ("description" IS NULL OR char_length(btrim("description")) BETWEEN 30 AND 3000)
  AND ("applyUrl" IS NULL OR char_length("applyUrl") <= 500)
  AND ("moderationNote" IS NULL OR char_length(btrim("moderationNote")) BETWEEN 3 AND 1000)
);

-- 2) Başvuru yolu: bağlantı yalnız `URL` yönteminde ve yalnız https olabilir; iletişim talebinde bağlantı yoktur.
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_apply_check" CHECK (
  ("applyMethod" IS NULL AND "applyUrl" IS NULL)
  OR ("applyMethod" IS NOT NULL AND (
    ("applyMethod" = 'CONTACT_REQUEST' AND "applyUrl" IS NULL)
    OR ("applyMethod" = 'URL' AND ("applyUrl" IS NULL OR "applyUrl" LIKE 'https://%'))
  ))
);

-- 3) DRAFT dışındaki her durum içeriği tamamlamıştır (konum ya da uzaktan; başvuru yolu tam; son tarih var).
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_ready_check" CHECK (
  "status" = 'DRAFT' OR (
    "title" IS NOT NULL AND "organizationName" IS NOT NULL AND "description" IS NOT NULL
    AND ("location" IS NOT NULL OR "isRemote")
    AND "applyMethod" IS NOT NULL AND ("applyMethod" <> 'URL' OR "applyUrl" IS NOT NULL)
    AND "deadlineOn" IS NOT NULL
  )
);

-- 4) Durum ↔ karar/yayın/bitiş alanları tutarlı. EXPIRED/CLOSED: gönderilmiş, bitiş anı var; yayın geçmişi varsa moderasyon izi de vardır
--    (PENDING iken süresi dolan/geri çekilen ilan yayına hiç girmemiştir). Yalnız CLOSED'ı moderatör kaldırabilir (`endedById`).
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_state_check" CHECK (
  ("status" = 'DRAFT' AND "submittedAt" IS NULL AND "moderatedById" IS NULL AND "moderatedAt" IS NULL AND "moderationNote" IS NULL
    AND "publishedAt" IS NULL AND "endedAt" IS NULL AND "endedById" IS NULL)
  OR ("status" = 'PENDING' AND "submittedAt" IS NOT NULL AND "moderatedById" IS NULL AND "moderatedAt" IS NULL AND "moderationNote" IS NULL
    AND "publishedAt" IS NULL AND "endedAt" IS NULL AND "endedById" IS NULL)
  OR ("status" = 'PUBLISHED' AND "submittedAt" IS NOT NULL AND "moderatedById" IS NOT NULL AND "moderatedAt" IS NOT NULL
    AND "moderationNote" IS NULL AND "publishedAt" IS NOT NULL AND "endedAt" IS NULL AND "endedById" IS NULL)
  OR ("status" = 'REJECTED' AND "submittedAt" IS NOT NULL AND "moderatedById" IS NOT NULL AND "moderatedAt" IS NOT NULL
    AND "moderationNote" IS NOT NULL AND "publishedAt" IS NULL AND "endedAt" IS NULL AND "endedById" IS NULL)
  OR ("status" IN ('EXPIRED', 'CLOSED') AND "submittedAt" IS NOT NULL AND "endedAt" IS NOT NULL AND "moderationNote" IS NULL
    AND (("publishedAt" IS NOT NULL AND "moderatedById" IS NOT NULL AND "moderatedAt" IS NOT NULL)
      OR ("publishedAt" IS NULL AND "moderatedById" IS NULL AND "moderatedAt" IS NULL))
    AND ("status" = 'CLOSED' OR "endedById" IS NULL))
);

-- 5) Son başvuru tarihi yayın gününden (İstanbul) en çok 60 gün sonradır (D19).
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_deadline_check" CHECK (
  "publishedAt" IS NULL OR "deadlineOn" IS NULL
  OR "deadlineOn" <= (("publishedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul')::date + 60
);

-- 6) Şikâyet: AÇIK şikâyet karar taşımaz; kapalı şikâyet karar anı ve notu taşır. Aynı kullanıcı/ilan için tek AÇIK şikâyet.
ALTER TABLE "JobPostingReport" ADD CONSTRAINT "JobPostingReport_state_check" CHECK (
  char_length(btrim("reason")) BETWEEN 3 AND 1000
  AND (("status" = 'OPEN' AND "reviewedAt" IS NULL AND "reviewedById" IS NULL AND "resolutionNote" IS NULL)
    OR ("status" <> 'OPEN' AND "reviewedAt" IS NOT NULL AND "reviewedById" IS NOT NULL AND "resolutionNote" IS NOT NULL))
);
CREATE UNIQUE INDEX "JobPostingReport_one_open_per_reporter" ON "JobPostingReport"("reporterId", "postingId")
  WHERE "status" = 'OPEN' AND "reporterId" IS NOT NULL;
