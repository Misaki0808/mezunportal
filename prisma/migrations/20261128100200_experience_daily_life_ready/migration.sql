-- Kart 572: "Günlük hayat" (DAILY_LIFE) deneyimi staja özgü alanlar olmadan gönderilir ve yayınlanır.
-- Yalnız hazır (DRAFT dışı) kaydın zorunlu alan kuralı gevşer: DAILY_LIFE için yalnız "ne öğrendi" zorunludur; diğer
-- türlerin koşulları aynen kalır, bu yüzden var olan satırların hepsi yeni kuralı da sağlar. Veri silinmez ya da değişmez.
ALTER TABLE "Experience" DROP CONSTRAINT "Experience_ready_check";
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_ready_check" CHECK (
  "status" = 'DRAFT' OR (
    char_length(btrim("whatLearned")) >= 1
    AND (
      "type" = 'DAILY_LIFE' OR (
        "organizationName" IS NOT NULL AND "termYear" IS NOT NULL AND "termSeason" IS NOT NULL
        AND char_length(btrim("advice")) >= 1
        AND ("type" NOT IN ('INTERNSHIP', 'ERASMUS', 'STUDY_ABROAD') OR "durationWeeks" IS NOT NULL)
        AND ("type" <> 'INTERNSHIP' OR "pay" IS NOT NULL)
        AND ("type" IN ('CLUB', 'CERTIFICATE') OR "applicationChannel" IS NOT NULL)
        AND ("type" NOT IN ('ERASMUS', 'STUDY_ABROAD') OR "country" IS NOT NULL)
      )
    )
  )
);
