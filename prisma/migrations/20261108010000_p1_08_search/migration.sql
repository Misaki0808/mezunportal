-- P1-08 Arama (docs/architecture.md "Arama"): Türkçe tam metin + pg_trgm. EKLEYİCİ: veri silmez/değiştirmez.
-- Geri alma:
--   DROP INDEX "Experience_published_newest_idx", "Experience_searchKeys_trgm", "Experience_searchVector_idx";
--   ALTER TABLE "Experience" DROP COLUMN "searchKeys", DROP COLUMN "searchVector";
--   DROP FUNCTION "experience_type_label"("ExperienceType"), "text_array_join"(text[]), "tr_ascii"(text), "tr_lower"(text);

-- tr-TR küçük harf (İ→i, I→ı) veritabanı yerelinden BAĞIMSIZDIR (üretilmiş sütun için değişmez olmalı).
CREATE FUNCTION "tr_lower"(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT lower(translate($1, 'İIÇĞÖŞÜÂÎÛ', 'iıçğöşüâîû'))
$$;

-- ASCII katlama: "ISTANBUL" (noktasız I) ile "İstanbul" ve "Diyarbakır" ile "diyarbakir" eşleşsin.
CREATE FUNCTION "tr_ascii"(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT translate("tr_lower"($1), 'ıçğöşüâîû', 'icgosuaiu')
$$;

-- `array_to_string` bildirimde STABLE'dır; metin dizisi için değişmezdir. plpgsql olduğundan satır içine alınmaz
-- (üretilmiş sütun için bildirilen değişmezlik kullanılır).
CREATE FUNCTION "text_array_join"(text[]) RETURNS text LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE STRICT AS $$
BEGIN
  RETURN array_to_string($1, ' ');
END
$$;

-- Tür adı aranabilir olsun ("staj" → INTERNSHIP). Metinler mesaj kataloğundaki terimlerle uyumlu.
CREATE FUNCTION "experience_type_label"("ExperienceType") RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE $1
    WHEN 'INTERNSHIP' THEN 'staj stajyer'
    WHEN 'ERASMUS' THEN 'erasmus değişim programı'
    WHEN 'COMPETITION' THEN 'yarışma'
    WHEN 'HACKATHON' THEN 'hackathon'
    WHEN 'CLUB' THEN 'kulüp topluluk'
    WHEN 'CERTIFICATE' THEN 'sertifika eğitim'
    WHEN 'GRADUATE_STUDY' THEN 'yüksek lisans lisansüstü'
    WHEN 'STUDY_ABROAD' THEN 'yurt dışı eğitim'
  END
$$;

-- Ağırlıklar: şirket/kurum A · tür, şehir, ülke B · metin C. Her alan hem tr-TR küçük harf + Türkçe gövdeleme
-- ("stajı" → staj) hem ASCII katlanmış basit sözlükle indekslenir (sorgu da iki biçimde aranır).
ALTER TABLE "Experience" ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('turkish', "tr_lower"(coalesce("organizationName", ''))), 'A')
  || setweight(to_tsvector('simple', "tr_ascii"(coalesce("organizationName", ''))), 'A')
  || setweight(to_tsvector('turkish', "tr_lower"("experience_type_label"("type") || ' ' || coalesce("city", '') || ' ' || coalesce("country", ''))), 'B')
  || setweight(to_tsvector('simple', "tr_ascii"("experience_type_label"("type") || ' ' || coalesce("city", '') || ' ' || coalesce("country", ''))), 'B')
  || setweight(to_tsvector('turkish', "tr_lower"("whatLearned" || ' ' || "advice" || ' ' || "text_array_join"("interviewQuestions"))), 'C')
  || setweight(to_tsvector('simple', "tr_ascii"("whatLearned" || ' ' || "advice" || ' ' || "text_array_join"("interviewQuestions"))), 'C')
) STORED;

-- Yazım hatası toleransı için kısa anahtar metin (şirket, şehir, ülke, tür adı): pg_trgm.
ALTER TABLE "Experience" ADD COLUMN "searchKeys" text GENERATED ALWAYS AS (
  "tr_ascii"(coalesce("organizationName", '') || ' ' || coalesce("city", '') || ' ' || coalesce("country", '') || ' ' || "experience_type_label"("type"))
) STORED;

CREATE INDEX "Experience_searchVector_idx" ON "Experience" USING gin ("searchVector");
CREATE INDEX "Experience_searchKeys_trgm" ON "Experience" USING gin ("searchKeys" gin_trgm_ops);
-- Metinsiz listeleme (en yeni) için yayınlanmışlara kısmi indeks.
CREATE INDEX "Experience_published_newest_idx" ON "Experience" ("publishedAt" DESC, "id") WHERE "status" = 'PUBLISHED';
