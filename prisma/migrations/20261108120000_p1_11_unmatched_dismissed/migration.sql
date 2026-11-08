-- P1-11 · Eşleşmeyen değer kuyruğu: "at" kararı (yönetici değeri anlamsız buldu).
-- Ekleyici: yeni boş bırakılabilir sütun + tutarlılık kısıtı + sayaç sıralaması için indeks.
-- Geri alma: DROP INDEX "UnmatchedValue_kind_count_idx";
--            ALTER TABLE "UnmatchedValue" DROP CONSTRAINT "UnmatchedValue_state_check";
--            ALTER TABLE "UnmatchedValue" DROP COLUMN "dismissedAt";

ALTER TABLE "UnmatchedValue" ADD COLUMN "dismissedAt" TIMESTAMP(3);

-- Bir değer ya çözülmüştür ya atılmıştır; ikisi birden olamaz.
ALTER TABLE "UnmatchedValue" ADD CONSTRAINT "UnmatchedValue_state_check"
  CHECK ("resolvedToId" IS NULL OR "dismissedAt" IS NULL);

CREATE INDEX "UnmatchedValue_kind_count_idx" ON "UnmatchedValue"("kind", "count");
