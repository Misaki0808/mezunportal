-- P1-03 · KVKK ve kontrollü iletişim sözleşmesi (EKLEYİCİ migration: yeni enum'lar ve tablolar).
-- Ham SQL kısıtlar dosyanın SONUNDADIR.
--
-- GERİ ALMA (veri yoktur; bu adım yalnız yeni tablolar ekler):
--   DROP TABLE "ContactRequest", "FieldVisibility", "Consent";
--   DROP FUNCTION "contact_fields_distinct"("ContactField"[]);
--   DROP TYPE "ContactRequestStatus", "VisibilityLevel", "ContactField", "ConsentDocument";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107210950_privacy_contract';
-- ("forbid_append_only_change" fonksiyonu önceki migration'ındır; geri almada SİLİNMEZ.)

-- CreateEnum
CREATE TYPE "ConsentDocument" AS ENUM ('PRIVACY_NOTICE', 'TERMS_OF_USE', 'CROSS_BORDER_TRANSFER');

-- CreateEnum
CREATE TYPE "ContactField" AS ENUM ('EMAIL', 'PHONE', 'SOCIAL_LINKS', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "VisibilityLevel" AS ENUM ('PRIVATE', 'ON_APPROVED_REQUEST', 'MEMBERS');

-- CreateEnum
CREATE TYPE "ContactRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REVOKED');

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentType" "ConsentDocument" NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldVisibility" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "field" "ContactField" NOT NULL,
    "level" "VisibilityLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fields" "ContactField"[],
    "message" TEXT,
    "status" "ContactRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consent_userId_documentType_createdAt_idx" ON "Consent"("userId", "documentType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FieldVisibility_userId_field_key" ON "FieldVisibility"("userId", "field");

-- CreateIndex
CREATE INDEX "ContactRequest_targetId_status_createdAt_idx" ON "ContactRequest"("targetId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ContactRequest_requesterId_status_createdAt_idx" ON "ContactRequest"("requesterId", "status", "createdAt");

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldVisibility" ADD CONSTRAINT "FieldVisibility_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================================
-- HAM SQL: Prisma şemasıyla ifade edilemeyen kısıtlar
-- =============================================================================================

-- Consent · YALNIZ EKLENİR: UPDATE, DELETE ve TRUNCATE reddedilir (AdminAuditLog ile aynı fonksiyon).
CREATE TRIGGER "Consent_append_only"
  BEFORE UPDATE OR DELETE ON "Consent"
  FOR EACH ROW EXECUTE FUNCTION "forbid_append_only_change"();
CREATE TRIGGER "Consent_no_truncate"
  BEFORE TRUNCATE ON "Consent"
  FOR EACH STATEMENT EXECUTE FUNCTION "forbid_append_only_change"();

-- Consent · sürüm etiketi kısa ve biçimli (örn. `taslak-1`, `1.2`).
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_version_check"
  CHECK ("version" ~ '^[a-z0-9][a-z0-9.-]{0,31}$');

-- ContactRequest · kendine talep yok; en az bir alan, tekrarsız; not ≤ 500 karakter.
-- Durum ↔ tarih tutarlılığı: karar anı yalnız karar verilmiş (onay/ret/geri alınmış) satırda;
-- kapanış anı yalnız WITHDRAWN/REVOKED satırda.
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_shape_check" CHECK (
  "requesterId" <> "targetId"
  AND cardinality("fields") BETWEEN 1 AND 4
  AND ("message" IS NULL OR char_length("message") BETWEEN 1 AND 500)
  AND (("status" IN ('APPROVED', 'REJECTED', 'REVOKED')) = ("decidedAt" IS NOT NULL))
  AND (("status" IN ('WITHDRAWN', 'REVOKED')) = ("closedAt" IS NOT NULL))
);

-- ContactRequest · alanlar tekrarsız (dizide aynı alan iki kez yok).
CREATE FUNCTION "contact_fields_distinct"("ContactField"[]) RETURNS boolean
  LANGUAGE sql IMMUTABLE AS $$ SELECT cardinality($1) = (SELECT count(DISTINCT f) FROM unnest($1) AS f) $$;
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_fields_distinct_check"
  CHECK ("contact_fields_distinct"("fields"));

-- ContactRequest · aynı ikili için aynı anda en fazla bir AÇIK (bekleyen ya da onaylı) talep.
CREATE UNIQUE INDEX "ContactRequest_open_pair_key"
  ON "ContactRequest"("requesterId", "targetId")
  WHERE "status" IN ('PENDING', 'APPROVED');
