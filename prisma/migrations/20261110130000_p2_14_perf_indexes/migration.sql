-- P2-14 performans: şirket sayfası, soru bankası ve başvuru takvimi `companyId` + `status = 'PUBLISHED'` ile okur; indeks yokken tüm
-- `Experience` tablosu taranıyordu (3.000 satırda ~2 ms, hacimle doğrusal artar). Yalnız EKLEYİCİ (indeks).
-- GERİ ALMA: DROP INDEX "Experience_companyId_status_idx";
CREATE INDEX "Experience_companyId_status_idx" ON "Experience"("companyId", "status");
