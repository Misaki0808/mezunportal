-- P1-04 · ilk giriş adım durumu (EKLEYİCİ migration: iki boş varsayılanlı sütun + CHECK).
-- Durum: completedSteps → COMPLETED, skippedSteps → SKIPPED, ikisinde de yoksa PENDING.
--
-- GERİ ALMA (bu migration):
--   ALTER TABLE "Profile" DROP CONSTRAINT "Profile_step_status_check",
--     DROP COLUMN "completedSteps", DROP COLUMN "skippedSteps";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107234432_p1_04_onboarding_step_status';
-- GERİ ALMA (bütün P1-04 şeması, 20261107221901_p1_04_profile dahil; profil verisi varsa önce yedek):
--   DROP TABLE "ProfileTag", "Profile", "Tag";
--   DROP TYPE "OnboardingStep", "TagKind";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261107221901_p1_04_profile';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "completedSteps" "OnboardingStep"[] DEFAULT ARRAY[]::"OnboardingStep"[],
ADD COLUMN     "skippedSteps" "OnboardingStep"[] DEFAULT ARRAY[]::"OnboardingStep"[];

-- Ham SQL: listeler NULL olamaz ve ayrıktır (bir adım hem tamamlanmış hem atlanmış olamaz); zorunlu
-- adım (MEMBERSHIP) atlanamaz; COMPLETE bir adım durumu değil ilerleme noktasıdır, listelere girmez.
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_step_status_check" CHECK (
  "completedSteps" IS NOT NULL
  AND "skippedSteps" IS NOT NULL
  AND NOT ("completedSteps" && "skippedSteps")
  AND NOT ('MEMBERSHIP' = ANY ("skippedSteps"))
  AND NOT ('COMPLETE' = ANY ("skippedSteps"))
  AND NOT ('COMPLETE' = ANY ("completedSteps"))
);
