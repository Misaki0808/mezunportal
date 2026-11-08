-- D7 · PM kart 143 ikinci karar: onay ve bekleyen yaşam döngüsü tamamen kaynak/bağlam içindedir.
-- open_context_key hem PENDING hem APPROVED tekilliğini zaten kaynak/bağlam başına korur.
-- Önceki migration uygulanmış kopyalar bulunduğu için eski dosya değiştirilmez; veri silinmez.
DROP INDEX "ContactRequest_approved_pair_key";

-- Geri alma: bir çiftte birden çok APPROVED varsa veri silmeden DUR.
-- BEGIN;
-- DO $$ BEGIN IF EXISTS (SELECT 1 FROM "ContactRequest" WHERE "status" = 'APPROVED'
--   GROUP BY "requesterId","targetId" HAVING count(*) > 1) THEN
--   RAISE EXCEPTION 'CONTACT_ROLLBACK_APPROVED_CONTEXTS'; END IF; END $$;
-- CREATE UNIQUE INDEX "ContactRequest_approved_pair_key" ON "ContactRequest" ("requesterId","targetId")
--   WHERE "status" = 'APPROVED';
-- COMMIT;
-- Uygulama da eski davranışa alınırsa kaynaklar arası gizlilik bağı geri gelir; ileri onarım tercih edilir.
