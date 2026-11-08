-- P2-06 · Değişmezler (önceki migration'ın enum değerlerini kullanır; ayrı işlemde).
-- Geri alma: ALTER TABLE "Profile" DROP CONSTRAINT "Profile_seeker_check"; ALTER TABLE "ContactRequest" DROP CONSTRAINT "ContactRequest_source_check";
--            eski ContactRequest_source_check (PROFILE | JOB_POSTING) için 20261109010000_p2_04_contact_request_source'a bak.

-- 1) Aday görünürlük bayrağı ve opak kimlik birlikte: bayrak açıkken kimlik vardır, kapalıyken yoktur; dönem yılı makul aralıkta.
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_seeker_check" CHECK (
  (("seekingInternship" AND "seekerRef" IS NOT NULL) OR (NOT "seekingInternship" AND "seekerRef" IS NULL))
  AND ("seekingTermYear" IS NULL OR "seekingTermYear" BETWEEN 2020 AND 2100)
  AND ("seekerRef" IS NULL OR char_length("seekerRef") BETWEEN 16 AND 64)
);

-- 2) İletişim talebi kaynağı: PROFILE ilan/aday izi taşımaz; JOB_POSTING başlık+kurum özetini taşır (ilan bağı silinince NULL olabilir);
--    SEEKER_PROFILE aday özeti (başlık satırı + bölüm) taşır ve ilan bağı taşımaz. Özet, hedefin kimliği değildir.
ALTER TABLE "ContactRequest" DROP CONSTRAINT "ContactRequest_source_check";
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_source_check" CHECK (
  ("source" = 'PROFILE' AND "jobPostingId" IS NULL AND "sourceTitle" IS NULL AND "sourceOrganization" IS NULL)
  OR ("source" = 'JOB_POSTING' AND "sourceTitle" IS NOT NULL AND "sourceOrganization" IS NOT NULL
    AND char_length(btrim("sourceTitle")) BETWEEN 1 AND 200 AND char_length(btrim("sourceOrganization")) BETWEEN 1 AND 200)
  OR ("source" = 'SEEKER_PROFILE' AND "jobPostingId" IS NULL AND "sourceTitle" IS NOT NULL AND "sourceOrganization" IS NOT NULL
    AND char_length(btrim("sourceTitle")) BETWEEN 1 AND 200 AND char_length(btrim("sourceOrganization")) BETWEEN 1 AND 200)
);
