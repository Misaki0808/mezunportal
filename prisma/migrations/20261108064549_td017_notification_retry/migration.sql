-- CreateEnum
CREATE TYPE "NotificationIntentStatus" AS ENUM ('PENDING', 'FAILED');

-- AlterTable
ALTER TABLE "NotificationIntent" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "NotificationIntentStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "NotificationIntent_status_nextAttemptAt_id_idx" ON "NotificationIntent"("status", "nextAttemptAt", "id");

-- Mevcut niyetler PENDING / 0 deneme ile korunur; kalıcı hatada adres/şifreli yük kalmaz.
ALTER TABLE "NotificationIntent" ADD CONSTRAINT "NotificationIntent_retry_state_check" CHECK (
  "attemptCount" >= 0 AND (
    ("status" = 'PENDING' AND "nextAttemptAt" IS NOT NULL AND "failedAt" IS NULL AND "failureCode" IS NULL)
    OR
    ("status" = 'FAILED' AND "attemptCount" > 0 AND "nextAttemptAt" IS NULL AND "failedAt" IS NOT NULL
      AND "failureCode" = 'RETRY_EXHAUSTED' AND "payload" = 'null'::jsonb)
  )
);

-- Geri alma: önce yeni worker'ı durdurun. FAILED satırları yeniden denemeye açılmamalıdır.
-- Eski uygulamaya dönüşten önce FAILED kayıtlarını ayrı güvenli yedeğe alın ve bu satırları kaldırın;
-- ardından constraint, yeni indeks, beş yeni sütun ve NotificationIntentStatus türünü kaldırın.
-- Bu geri alma veri siler; uygulama geri alımı için migration'ı yerinde bırakmak tercih edilir.
