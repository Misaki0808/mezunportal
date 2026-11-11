-- Dış servis bağlantısı (kart 174): sistem yöneticisinin tek seferlik Google Takvim OAuth yetkilendirmesi.
-- Yalnız EKLEYİCİ (yeni enum + yeni tablo). GERİ ALMA: DROP TABLE "IntegrationConnection"; DROP TYPE "IntegrationStatus";
-- DROP TYPE "IntegrationProvider"; (tablo yalnız bağlantıyı tutar; silmek takvimi kapatır, randevular mentorun elle linkine döner.)

CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE_CALENDAR');
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT');

CREATE TABLE "IntegrationConnection" (
  "id" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
  "refreshTokenEnc" TEXT NOT NULL,
  "accountLabel" TEXT,
  "scope" TEXT NOT NULL,
  "connectedById" TEXT NOT NULL,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastErrorCode" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_provider_key" ON "IntegrationConnection"("provider");
CREATE INDEX "IntegrationConnection_connectedById_idx" ON "IntegrationConnection"("connectedById");

ALTER TABLE "IntegrationConnection"
  ADD CONSTRAINT "IntegrationConnection_connectedById_fkey"
  FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Şifreli jeton biçimi (`secret-box`: `v1.<iv>.<etiket>.<şifreli>`): düz metin jeton kazara yazılamaz.
-- Hata kodu ve etiket uzunluk sınırlıdır (sağlayıcı yanıtı / uzun metin saklanmaz).
ALTER TABLE "IntegrationConnection"
  ADD CONSTRAINT "IntegrationConnection_shape_check" CHECK (
    "refreshTokenEnc" ~ '^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$'
    AND ("accountLabel" IS NULL OR char_length("accountLabel") BETWEEN 1 AND 200)
    AND ("lastErrorCode" IS NULL OR "lastErrorCode" ~ '^[A-Z_]{3,60}$')
    AND char_length("scope") BETWEEN 1 AND 500
  );
