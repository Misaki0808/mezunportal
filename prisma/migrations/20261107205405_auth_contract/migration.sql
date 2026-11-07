-- P1-02 · Kimlik doğrulama sözleşmesi (EKLEYİCİ migration: User.role sütunu + yeni tablolar).
-- Ham SQL kısıtlar dosyanın SONUNDADIR.
--
-- GERİ ALMA (veri yoktur; bu adım yeni tablolar ve boş geçilebilir bir sütun ekler):
--   DROP TABLE "EmailLog", "GraduationDocument", "RateLimit", "Verification", "Account", "Session";
--   DROP TYPE "EmailStatus", "GraduationDocumentStatus";
--   ALTER TABLE "User" DROP COLUMN "role";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107205405_auth_contract';

-- CreateEnum
CREATE TYPE "GraduationDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraduationDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "graduationYear" INTEGER NOT NULL,
    "storageKey" TEXT,
    "status" "GraduationDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraduationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");

-- CreateIndex
CREATE INDEX "GraduationDocument_departmentId_status_createdAt_idx" ON "GraduationDocument"("departmentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "GraduationDocument_userId_idx" ON "GraduationDocument"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_idempotencyKey_key" ON "EmailLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "EmailLog_status_createdAt_idx" ON "EmailLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_recipientUserId_idx" ON "EmailLog"("recipientUserId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraduationDocument" ADD CONSTRAINT "GraduationDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraduationDocument" ADD CONSTRAINT "GraduationDocument_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraduationDocument" ADD CONSTRAINT "GraduationDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- =============================================================================================
-- HAM SQL: Prisma şemasıyla ifade edilemeyen kısıtlar
-- =============================================================================================

-- GraduationDocument · Bir kullanıcının aynı bölüm için en fazla bir BEKLEYEN belgesi olur
-- (karar verilmeden ikinci yükleme kuyruğu şişirmez).
CREATE UNIQUE INDEX "GraduationDocument_pending_user_department_key"
  ON "GraduationDocument"("userId", "departmentId")
  WHERE "status" = 'PENDING';

-- GraduationDocument · Belge dosyası YALNIZ karar verilene kadar durur: BEKLEYEN satırda storageKey dolu
-- ve karar alanları boş; karar verilmiş satırda storageKey NULL (dosya silinmiştir) ve karar alanları dolu.
-- Ret gerekçesi yalnız REDDEDİLEN satırda ve 3–1000 karakter.
ALTER TABLE "GraduationDocument" ADD CONSTRAINT "GraduationDocument_decision_consistent_check" CHECK (
  (("status" = 'PENDING') = ("storageKey" IS NOT NULL))
  AND (("status" = 'PENDING') = ("reviewedAt" IS NULL))
  AND (("status" = 'PENDING') = ("reviewedById" IS NULL))
  AND (("status" = 'REJECTED') = ("rejectReason" IS NOT NULL))
  AND ("rejectReason" IS NULL OR char_length("rejectReason") BETWEEN 3 AND 1000)
  AND ("storageKey" IS NULL OR "storageKey" LIKE 'graduation/%')
  AND ("graduationYear" BETWEEN 1950 AND 2100)
);

-- EmailLog · SENT ile sentAt birlikte; kimlik anahtarı ve şablon adı makul uzunlukta; deneme sayısı negatif olamaz.
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_shape_check" CHECK (
  (("status" = 'SENT') = ("sentAt" IS NOT NULL))
  AND char_length("idempotencyKey") BETWEEN 1 AND 200
  AND char_length("template") BETWEEN 1 AND 64
  AND "attempts" >= 0
);

-- Session · Süresi geçmiş oturumların temizliği için indeks (zamanlanmış iş: silinecek satırları bulur).
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE INDEX "Verification_expiresAt_idx" ON "Verification"("expiresAt");
