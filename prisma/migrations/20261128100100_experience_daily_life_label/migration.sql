-- Kart 572: "Günlük hayat" türü aranabilsin. Etiket işlevi NULL dönerse arama sütunlarının tamamı NULL olurdu
-- (searchVector/searchKeys birleştirmede NULL yayılır); bu yüzden yeni türün etiketi burada eklenir.
-- İşlev aynı imzayla yerinde değişir; bağımlı üretilmiş sütunlar etkilenmez (bu türde henüz satır yok).
CREATE OR REPLACE FUNCTION "experience_type_label"("ExperienceType") RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE $1
    WHEN 'INTERNSHIP' THEN 'staj stajyer'
    WHEN 'ERASMUS' THEN 'erasmus değişim programı'
    WHEN 'COMPETITION' THEN 'yarışma'
    WHEN 'HACKATHON' THEN 'hackathon'
    WHEN 'CLUB' THEN 'kulüp topluluk'
    WHEN 'CERTIFICATE' THEN 'sertifika eğitim'
    WHEN 'GRADUATE_STUDY' THEN 'yüksek lisans lisansüstü'
    WHEN 'STUDY_ABROAD' THEN 'yurt dışı eğitim'
    WHEN 'DAILY_LIFE' THEN 'günlük hayat günlük yaşam'
  END
$$;
