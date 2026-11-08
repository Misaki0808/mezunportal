-- D7: bekleyen talepler kaynak/bağlam başına tek; farklı kaynaklar kimliği eşleyemez.
-- JOB_POSTING: ilan silinip FK NULL olursa kayıt id'si yetim bağlamı ayırır; silmede çakışma olmaz.
-- Önce yeni indeksler kurulur; mevcut çift tekilliği daha sıkı olduğundan veri temizliği gerekmez.
CREATE UNIQUE INDEX "ContactRequest_open_context_key"
  ON "ContactRequest" ("requesterId", "targetId", "source",
    (CASE WHEN "source" = 'JOB_POSTING' THEN COALESCE("jobPostingId", "id") ELSE '' END))
  WHERE "status" IN ('PENDING', 'APPROVED');
CREATE UNIQUE INDEX "ContactRequest_approved_pair_key"
  ON "ContactRequest" ("requesterId", "targetId") WHERE "status" = 'APPROVED';
DROP INDEX "ContactRequest_open_pair_key";

-- Geri alma (tek işlemde; veri silmez): önce bir çiftte birden çok açık talep varsa DUR.
-- BEGIN;
-- DO $$ BEGIN IF EXISTS (SELECT 1 FROM "ContactRequest" WHERE "status" IN ('PENDING','APPROVED')
--   GROUP BY "requesterId","targetId" HAVING count(*) > 1) THEN
--   RAISE EXCEPTION 'CONTACT_ROLLBACK_OPEN_CONTEXTS'; END IF; END $$;
-- CREATE UNIQUE INDEX "ContactRequest_open_pair_key" ON "ContactRequest" ("requesterId","targetId")
--   WHERE "status" IN ('PENDING','APPROVED');
-- DROP INDEX "ContactRequest_open_context_key";
-- DROP INDEX "ContactRequest_approved_pair_key";
-- COMMIT;
-- Çakışmada eski uygulamaya dönülmez; kullanıcı kararlarıyla talepler kapanır veya ileri onarım yapılır.
