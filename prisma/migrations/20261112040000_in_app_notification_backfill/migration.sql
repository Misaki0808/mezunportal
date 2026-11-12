-- VERİ EKLEYEN MİGRATİON (şema değişmez): eski ilan eşleşmeleri (JobMatch) bildirim kutusuna OKUNMUŞ olarak taşınır.
-- Yalnız ekler: hiçbir satırı silmez ya da değiştirmez. Idempotenttir: anahtar ("kind:refId:userId") benzersiz olduğundan ikinci
-- çalıştırmada ve uygulama kendi yazdığı kayıtlarla çakışmada ON CONFLICT DO NOTHING çift kayıt üretmez. Kişisel veri taşımaz
-- (yalnız tür + ilan kimliği + zaman). Yalnız hâlâ yayında olan ilanlar ve silinmemiş kullanıcılar taşınır (eski düz liste de
-- yalnız bunları gösteriyordu); okunmuş işaretlenir ki yükleme anında kimsenin rozeti birden dolmasın.
INSERT INTO "InAppNotification" ("id", "userId", "kind", "refId", "key", "createdAt", "readAt")
SELECT
  gen_random_uuid()::text,
  m."userId",
  'jobMatchPosting',
  m."postingId",
  'jobMatchPosting:' || m."postingId" || ':' || m."userId",
  m."createdAt",
  m."createdAt"
FROM "JobMatch" m
JOIN "JobPosting" p ON p."id" = m."postingId" AND p."status" = 'PUBLISHED'
JOIN "User" u ON u."id" = m."userId" AND u."deletedAt" IS NULL
ON CONFLICT ("key") DO NOTHING;
