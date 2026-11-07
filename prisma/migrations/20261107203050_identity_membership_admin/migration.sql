-- P1-01 · Kimlik, üyelik, yetki ve işlem kaydı (EKLEYİCİ migration: yalnız yeni tipler ve tablolar).
-- Prisma'nın ifade edemediği kısıtlar dosyanın SONUNDA ham SQL olarak durur (docs/data.md "Temel değişmezler").
--
-- GERİ ALMA (veri yoktur; bu adım yeni tablolar ekler):
--   DROP TRIGGER "AdminAuditLog_no_truncate" ON "AdminAuditLog";
--   DROP TRIGGER "AdminAuditLog_append_only" ON "AdminAuditLog";
--   DROP FUNCTION "forbid_append_only_change"();
--   DROP TABLE "AdminAuditLog", "MentorProfile", "AdminGrant", "Membership", "User";
--   DROP TYPE "MeetingMode", "AdminScope", "VerificationMethod", "VerificationStatus", "MembershipRole";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107203050_identity_membership_admin';

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('STUDENT', 'ALUMNI', 'ACADEMIC');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('STUDENT_EMAIL', 'STAFF_EMAIL', 'GRADUATION_DOCUMENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "AdminScope" AS ENUM ('SYSTEM', 'FACULTY', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "MeetingMode" AS ENUM ('ONLINE', 'IN_PERSON');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "phone" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "entryYear" INTEGER,
    "classOffset" INTEGER NOT NULL DEFAULT 0,
    "graduationYear" INTEGER,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationMethod" "VerificationMethod" NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "AdminScope" NOT NULL,
    "facultyId" TEXT,
    "departmentId" TEXT,
    "grantedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorProfile" (
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "monthlyCapacity" INTEGER NOT NULL,
    "sessionMinutes" INTEGER NOT NULL,
    "meetingModes" "MeetingMode"[],
    "inPersonNote" TEXT,
    "pausedUntil" TIMESTAMP(3),
    "cvReviewEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cvReviewMonthlyLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentorProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_departmentId_verificationStatus_idx" ON "Membership"("departmentId", "verificationStatus");

-- CreateIndex
CREATE INDEX "AdminGrant_userId_idx" ON "AdminGrant"("userId");

-- CreateIndex
CREATE INDEX "AdminGrant_facultyId_idx" ON "AdminGrant"("facultyId");

-- CreateIndex
CREATE INDEX "AdminGrant_departmentId_idx" ON "AdminGrant"("departmentId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_actorId_createdAt_idx" ON "AdminAuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_action_createdAt_idx" ON "AdminAuditLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "Faculty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorProfile" ADD CONSTRAINT "MentorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================================
-- HAM SQL: Prisma şemasıyla ifade edilemeyen kısıtlar
-- =============================================================================================

-- Membership · Bir kullanıcının aynı bölüm ve rolde en fazla bir ETKİN (endedAt boş) üyeliği vardır.
CREATE UNIQUE INDEX "Membership_active_user_department_role_key"
  ON "Membership"("userId", "departmentId", "role")
  WHERE "endedAt" IS NULL;

-- Membership · Rol ile doğrulama yolu uyumlu olmalı (D2): alan adı yalnız öğrenci/akademisyeni,
-- belge yalnız mezunu doğrular; başka her şey yönetici (ADMIN) kararıdır. Alan adı ile mezun
-- üyeliği doğrulanamaz.
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_method_matches_role_check" CHECK (
  "verificationMethod" = 'ADMIN'
  OR ("role" = 'STUDENT'  AND "verificationMethod" = 'STUDENT_EMAIL')
  OR ("role" = 'ACADEMIC' AND "verificationMethod" = 'STAFF_EMAIL')
  OR ("role" = 'ALUMNI'   AND "verificationMethod" = 'GRADUATION_DOCUMENT')
);

-- Membership · Doğrulama tutarlılığı: verifiedAt yalnız VERIFIED'da dolu; yönetici/belge ile
-- doğrulanan üyelikte doğrulayan kullanıcı (verifiedById) zorunlu (denetlenebilirlik).
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_verification_consistent_check" CHECK (
  (("verificationStatus" = 'VERIFIED') = ("verifiedAt" IS NOT NULL))
  AND (
    "verificationStatus" <> 'VERIFIED'
    OR "verificationMethod" NOT IN ('ADMIN', 'GRADUATION_DOCUMENT')
    OR "verifiedById" IS NOT NULL
  )
);

-- Membership · Yıl alanları makul aralıkta ve role uygun: giriş yılı/düzeltme öğrenciye, mezuniyet
-- yılı mezuna aittir; akademisyende ikisi de boştur. Düzeltme aralığı rules/classYear ile aynıdır (-3..3).
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_years_check" CHECK (
  ("entryYear" IS NULL OR "entryYear" BETWEEN 1950 AND 2100)
  AND ("graduationYear" IS NULL OR "graduationYear" BETWEEN 1950 AND 2100)
  AND ("graduationYear" IS NULL OR "entryYear" IS NULL OR "graduationYear" >= "entryYear")
  AND ("graduationYear" IS NULL OR "role" = 'ALUMNI')
  AND ("role" <> 'ACADEMIC' OR ("entryYear" IS NULL AND "graduationYear" IS NULL))
  AND ("classOffset" BETWEEN -3 AND 3)
  AND ("role" = 'STUDENT' OR "classOffset" = 0)
);

-- AdminGrant · Kapsam ile hedef uyumlu: SYSTEM hedefsiz, FACULTY fakülteli, DEPARTMENT bölümlü.
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_scope_target_check" CHECK (
  ("scope" = 'SYSTEM'     AND "facultyId" IS NULL     AND "departmentId" IS NULL)
  OR ("scope" = 'FACULTY'    AND "facultyId" IS NOT NULL AND "departmentId" IS NULL)
  OR ("scope" = 'DEPARTMENT' AND "departmentId" IS NOT NULL AND "facultyId" IS NULL)
);

-- AdminGrant · Aynı kullanıcıya aynı kapsam için en fazla bir ETKİN yetki (NULL'lar eşit sayılır: PostgreSQL 15+).
CREATE UNIQUE INDEX "AdminGrant_active_user_scope_target_key"
  ON "AdminGrant"("userId", "scope", "facultyId", "departmentId") NULLS NOT DISTINCT
  WHERE "revokedAt" IS NULL;

-- AdminGrant · Kaldırma zamanı ve kaldıran kullanıcı birlikte dolar.
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_revocation_consistent_check" CHECK (
  ("revokedAt" IS NULL) = ("revokedById" IS NULL)
);

-- MentorProfile · Görüşme süresi 15/20/30 dk; kapasite ve inceleme sınırı negatif olamaz; etkin
-- profilin en az bir görüşme biçimi vardır.
ALTER TABLE "MentorProfile" ADD CONSTRAINT "MentorProfile_settings_check" CHECK (
  "sessionMinutes" IN (15, 20, 30)
  AND "monthlyCapacity" >= 0
  AND "cvReviewMonthlyLimit" >= 0
  AND (NOT "isActive" OR cardinality("meetingModes") > 0)
);

-- AdminAuditLog · Biçim sınırları: eylem adı kısa, gerekçe makul, metadata bir JSON nesnesi.
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_shape_check" CHECK (
  char_length("action") BETWEEN 1 AND 64
  AND char_length("targetType") BETWEEN 1 AND 64
  AND ("reason" IS NULL OR char_length("reason") BETWEEN 1 AND 1000)
  AND jsonb_typeof("metadata") = 'object'
);

-- AdminAuditLog · YALNIZ EKLENİR (docs/data.md): güncelleme, silme ve TRUNCATE tetikleyiciyle reddedilir.
-- Uygulama hatası ya da yanlış bir sorgu bile kaydı değiştiremez. (Test veritabanı sıfırlaması şemayı
-- DROP ettiği için etkilenmez.)
CREATE FUNCTION "forbid_append_only_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% tablosu yalnız eklenir: % işlemi reddedildi', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE TRIGGER "AdminAuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION "forbid_append_only_change"();

CREATE TRIGGER "AdminAuditLog_no_truncate"
  BEFORE TRUNCATE ON "AdminAuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_append_only_change"();
