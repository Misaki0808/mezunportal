-- Kart 572: deneyime "Günlük hayat" türü (staj dışı, günlük yaşamdan deneyimler). Ekleyici; mevcut satırlar değişmez.
-- Yeni enum değeri aynı işlemde kullanılamaz; arama etiketi işlevi bir sonraki migration'da güncellenir.
ALTER TYPE "ExperienceType" ADD VALUE 'DAILY_LIFE';
