-- P1-17 · SSS akışı: FaqRequest, FaqAnswer, FaqItem (ekleyici; mevcut tabloya dokunmaz).
-- Geri alma: DROP TABLE "FaqItem", "FaqAnswer", "FaqRequest"; DROP TYPE "FaqStatus";
-- Not: `prisma migrate diff` çıktısından türetildi; üretilmiş arama sütunları ve GIN indeksleri aşağıda ham SQL ile eklenir
-- (şemada `dbgenerated()` ile modellidir; docs/decisions.md "Üretilmiş arama sütunları").

-- CreateEnum
CREATE TYPE "FaqStatus" AS ENUM ('OPEN', 'PUBLISHED', 'REJECTED', 'REDIRECTED');

-- CreateTable
CREATE TABLE "FaqRequest" (
    "id" TEXT NOT NULL,
    "askerId" TEXT,
    "departmentIdAtWrite" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "FaqStatus" NOT NULL DEFAULT 'OPEN',
    "decisionNote" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqAnswer" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "mentorId" TEXT,
    "body" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqItem" (
    "id" TEXT NOT NULL,
    "sourceRequestId" TEXT NOT NULL,
    "departmentIdAtWrite" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FaqItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FaqRequest_status_departmentIdAtWrite_createdAt_idx" ON "FaqRequest"("status", "departmentIdAtWrite", "createdAt");

-- CreateIndex
CREATE INDEX "FaqRequest_askerId_createdAt_idx" ON "FaqRequest"("askerId", "createdAt");

-- CreateIndex
CREATE INDEX "FaqAnswer_mentorId_createdAt_idx" ON "FaqAnswer"("mentorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FaqAnswer_requestId_mentorId_key" ON "FaqAnswer"("requestId", "mentorId");

-- CreateIndex
CREATE UNIQUE INDEX "FaqItem_sourceRequestId_key" ON "FaqItem"("sourceRequestId");

-- CreateIndex
CREATE INDEX "FaqItem_publishedAt_id_idx" ON "FaqItem"("publishedAt" DESC, "id");

-- AddForeignKey
ALTER TABLE "FaqRequest" ADD CONSTRAINT "FaqRequest_askerId_fkey" FOREIGN KEY ("askerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqRequest" ADD CONSTRAINT "FaqRequest_departmentIdAtWrite_fkey" FOREIGN KEY ("departmentIdAtWrite") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqAnswer" ADD CONSTRAINT "FaqAnswer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FaqRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqAnswer" ADD CONSTRAINT "FaqAnswer_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqItem" ADD CONSTRAINT "FaqItem_sourceRequestId_fkey" FOREIGN KEY ("sourceRequestId") REFERENCES "FaqRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FaqItem" ADD CONSTRAINT "FaqItem_departmentIdAtWrite_fkey" FOREIGN KEY ("departmentIdAtWrite") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Üretilmiş arama sütunları (Experience ile aynı kural): soru A, cevap B ağırlığında; her alan hem tr-TR küçük harf +
-- Türkçe gövdeleme hem ASCII katlanmış basit sözlükle indekslenir. `searchKeys`: yazım hatası/benzerlik için soru (pg_trgm).
ALTER TABLE "FaqItem" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('turkish', "tr_lower"("question")), 'A')
  || setweight(to_tsvector('simple', "tr_ascii"("question")), 'A')
  || setweight(to_tsvector('turkish', "tr_lower"("answer")), 'B')
  || setweight(to_tsvector('simple', "tr_ascii"("answer")), 'B')
) STORED;
ALTER TABLE "FaqItem" ADD COLUMN "searchKeys" text GENERATED ALWAYS AS ("tr_ascii"("question")) STORED;
CREATE INDEX "FaqItem_searchVector_idx" ON "FaqItem" USING gin ("searchVector");
CREATE INDEX "FaqItem_searchKeys_trgm" ON "FaqItem" USING gin ("searchKeys" gin_trgm_ops);

-- Değişmezler (ham SQL; Prisma şeması ifade edemez):
-- 1) Karar alanları durumla tutarlı: OPEN karar taşımaz; PUBLISHED karar anı taşır, not taşımaz; REJECTED/REDIRECTED ikisini de taşır.
ALTER TABLE "FaqRequest" ADD CONSTRAINT "FaqRequest_state_check" CHECK (
  ("status" = 'OPEN' AND "decidedAt" IS NULL AND "decidedById" IS NULL AND "decisionNote" IS NULL)
  OR ("status" = 'PUBLISHED' AND "decidedAt" IS NOT NULL AND "decisionNote" IS NULL)
  OR ("status" IN ('REJECTED', 'REDIRECTED') AND "decidedAt" IS NOT NULL AND "decisionNote" IS NOT NULL)
);

-- 2) Bir talepte en çok bir seçilmiş cevap.
CREATE UNIQUE INDEX "FaqAnswer_one_selected_per_request" ON "FaqAnswer"("requestId") WHERE "isSelected";

-- 3) Metin sınırları (sunucu Zod'u da aynı sınırı uygular).
ALTER TABLE "FaqRequest" ADD CONSTRAINT "FaqRequest_question_check" CHECK (char_length("question") BETWEEN 1 AND 500);
ALTER TABLE "FaqAnswer" ADD CONSTRAINT "FaqAnswer_body_check" CHECK (char_length("body") BETWEEN 1 AND 2000);
ALTER TABLE "FaqItem" ADD CONSTRAINT "FaqItem_text_check" CHECK (
  char_length("question") BETWEEN 1 AND 500 AND char_length("answer") BETWEEN 1 AND 2000
);
