-- P1-16 · Puan motoru: PointRule, PointEntry, SuspicionFlag, UserBadge (ekleyici; mevcut tabloya dokunmaz).
-- Geri alma: DROP TABLE "UserBadge", "SuspicionFlag", "PointEntry", "PointRule";
--            DROP TYPE "BadgeKind", "SuspicionStatus", "SuspicionRule", "PointRevokeReason", "PointStatus",
--                      "PointSourceType", "PointAction";
-- Not: `prisma migrate diff` çıktısından türetildi; arama sütunu / GIN / trigram satırı İÇERMEZ (#37 bekçisi).

-- CreateEnum
CREATE TYPE "PointAction" AS ENUM ('EXPERIENCE_PUBLISHED', 'FAQ_QUESTION_PUBLISHED', 'FAQ_ANSWER_SELECTED', 'FAQ_ANSWER_PARTICIPATION', 'CV_REVIEW_HELPFUL', 'SESSION_ONLINE', 'SESSION_IN_PERSON');

-- CreateEnum
CREATE TYPE "PointSourceType" AS ENUM ('EXPERIENCE', 'APPOINTMENT', 'CV_REVIEW', 'FAQ_REQUEST', 'FAQ_ANSWER');

-- CreateEnum
CREATE TYPE "PointStatus" AS ENUM ('PENDING', 'FINAL', 'REVOKED');

-- CreateEnum
CREATE TYPE "PointRevokeReason" AS ENUM ('ADMIN_CANCEL', 'FRAUD_CONFIRMED');

-- CreateEnum
CREATE TYPE "SuspicionRule" AS ENUM ('BURST', 'SINGLE_COUNTERPART', 'SYNC_FEEDBACK');

-- CreateEnum
CREATE TYPE "SuspicionStatus" AS ENUM ('OPEN', 'CONFIRMED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "BadgeKind" AS ENUM ('FOUNDING_MEMBER');

-- CreateTable
CREATE TABLE "PointRule" (
    "action" "PointAction" NOT NULL,
    "points" INTEGER NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PointRule_pkey" PRIMARY KEY ("action")
);

-- CreateTable
CREATE TABLE "PointEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "PointAction" NOT NULL,
    "sourceType" "PointSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "counterpartId" TEXT,
    "basePoints" INTEGER NOT NULL,
    "multiplierPercent" INTEGER NOT NULL DEFAULT 100,
    "points" INTEGER NOT NULL,
    "status" "PointStatus" NOT NULL DEFAULT 'FINAL',
    "eventAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizesAt" TIMESTAMP(3),
    "finalizedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokedReason" "PointRevokeReason",

    CONSTRAINT "PointEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuspicionFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rule" "SuspicionRule" NOT NULL,
    "status" "SuspicionStatus" NOT NULL DEFAULT 'OPEN',
    "evidenceKey" TEXT NOT NULL,
    "entryIds" TEXT[],
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "sharePercent" INTEGER,
    "syncedCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,

    CONSTRAINT "SuspicionFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "BadgeKind" NOT NULL,
    "sourceEntryId" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointEntry_userId_status_createdAt_idx" ON "PointEntry"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PointEntry_status_finalizesAt_idx" ON "PointEntry"("status", "finalizesAt");

-- CreateIndex
CREATE INDEX "PointEntry_userId_counterpartId_eventAt_idx" ON "PointEntry"("userId", "counterpartId", "eventAt");

-- CreateIndex
CREATE UNIQUE INDEX "PointEntry_userId_action_sourceType_sourceId_key" ON "PointEntry"("userId", "action", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "SuspicionFlag_status_createdAt_idx" ON "SuspicionFlag"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SuspicionFlag_userId_rule_evidenceKey_key" ON "SuspicionFlag"("userId", "rule", "evidenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_kind_key" ON "UserBadge"("userId", "kind");

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_counterpartId_fkey" FOREIGN KEY ("counterpartId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuspicionFlag" ADD CONSTRAINT "SuspicionFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "PointEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- Değişmezler (ham SQL; Prisma şeması ifade edemez):
-- 1) Puan = taban × çarpan / 100 (tam sayı, aşağı yuvarlanır); çarpan 0..100; negatif yok.
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_points_check" CHECK (
  "basePoints" >= 0
  AND "multiplierPercent" BETWEEN 0 AND 100
  AND "points" = ("basePoints" * "multiplierPercent") / 100
);

-- 2) Durum tutarlılığı: PENDING bir kesinleşme anı taşır (henüz kesinleşmemiştir, geri alınmamıştır); FINAL geri alma
--    bilgisi taşımaz; REVOKED geri alma anı + nedeni taşır.
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_state_check" CHECK (
  ("status" = 'PENDING' AND "finalizesAt" IS NOT NULL AND "finalizedAt" IS NULL AND "revokedAt" IS NULL AND "revokedReason" IS NULL)
  OR ("status" = 'FINAL' AND "revokedAt" IS NULL AND "revokedReason" IS NULL)
  OR ("status" = 'REVOKED' AND "revokedAt" IS NOT NULL AND "revokedReason" IS NOT NULL)
);

-- 3) Kendi kendine karşı taraf olamaz.
ALTER TABLE "PointEntry" ADD CONSTRAINT "PointEntry_counterpart_check" CHECK (
  "counterpartId" IS NULL OR "counterpartId" <> "userId"
);

-- 4) Kural değerleri sınırlı ve negatif değil (sunucu Zod'u da aynı sınırı uygular).
ALTER TABLE "PointRule" ADD CONSTRAINT "PointRule_range_check" CHECK (
  "points" BETWEEN 0 AND 100 AND "delayDays" BETWEEN 0 AND 30
);

-- 5) Şüphe işareti: OPEN karar anı taşımaz, karar verilmiş taşır; aynı (kullanıcı, kural) için en çok bir OPEN işaret.
ALTER TABLE "SuspicionFlag" ADD CONSTRAINT "SuspicionFlag_state_check" CHECK (
  ("status" = 'OPEN' AND "decidedAt" IS NULL)
  OR ("status" <> 'OPEN' AND "decidedAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "SuspicionFlag_one_open_per_rule" ON "SuspicionFlag"("userId", "rule") WHERE "status" = 'OPEN';
