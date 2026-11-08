-- P1-06 beceri modeli (TD-010): beceri = Tag(SKILL) + ProfileTag. EKLEYİCİ: veri silmez; eski UserSkill tablosu
-- korunur (daraltma sonraki migration'da). Geri alma:
--   ALTER TABLE "Tag" DROP CONSTRAINT "Tag_skill_label_check";
--   ALTER TABLE "Tag" DROP COLUMN "curated", DROP COLUMN "label";
--   ALTER TABLE "Profile" DROP COLUMN "manualFields";
--   (taşınan ProfileTag/Tag SKILL satırları: DELETE FROM "ProfileTag" WHERE "tagId" IN (SELECT "id" FROM "Tag" WHERE "kind" = 'SKILL'); DELETE FROM "Tag" WHERE "kind" = 'SKILL';)

ALTER TABLE "Tag" ADD COLUMN "label" TEXT, ADD COLUMN "curated" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Profile" ADD COLUMN "manualFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
UPDATE "Profile" SET "manualFields" = ARRAY[]::TEXT[] WHERE "manualFields" IS NULL;
ALTER TABLE "Profile" ALTER COLUMN "manualFields" SET NOT NULL;
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_manualFields_check"
  CHECK ("manualFields" <@ ARRAY['headline', 'summary', 'city']::TEXT[]);

-- Var olan SKILL etiketi (varsa) etiketsiz kalmasın.
UPDATE "Tag" SET "label" = "slug" WHERE "kind" = 'SKILL' AND "label" IS NULL;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_skill_label_check" CHECK (
  "kind" <> 'SKILL' OR ("label" IS NOT NULL AND char_length("label") BETWEEN 1 AND 80)
);

-- Eski kullanıcı becerilerini taşı: sözlük eşleşmesi varsa kurallı (curated) etiket, yoksa kişisel etiket.
INSERT INTO "Tag" ("id", "kind", "slug", "label", "curated", "createdAt", "updatedAt")
SELECT DISTINCT ON (slug) gen_random_uuid()::text, 'SKILL', slug, label, curated, now(), now()
FROM (
  SELECT COALESCE(s."normalizedName", us."normalizedName") AS slug,
         COALESCE(s."name", us."name") AS label,
         (us."skillId" IS NOT NULL) AS curated
  FROM "UserSkill" us LEFT JOIN "Skill" s ON s."id" = us."skillId"
) AS source
ORDER BY slug, curated DESC
ON CONFLICT ("kind", "slug") DO NOTHING;

INSERT INTO "Profile" ("id", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "userId", now(), now() FROM (SELECT DISTINCT "userId" FROM "UserSkill") users
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "ProfileTag" ("profileId", "tagId", "createdAt", "updatedAt")
SELECT DISTINCT p."id", t."id", us."createdAt", now()
FROM "UserSkill" us
LEFT JOIN "Skill" s ON s."id" = us."skillId"
JOIN "Profile" p ON p."userId" = us."userId"
JOIN "Tag" t ON t."kind" = 'SKILL' AND t."slug" = COALESCE(s."normalizedName", us."normalizedName")
ON CONFLICT DO NOTHING;
