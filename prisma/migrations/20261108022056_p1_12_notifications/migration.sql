-- P1-12 ekleyici migration. Geri alma (yalnız açık onayla): NotificationAction ve
-- NotificationPreference tablolarını, ardından StillThereChoice ve NotificationType enumlarını kaldır.
-- CreateEnum
DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('ACCOUNT_SECURITY', 'GRADUATION_DECISION', 'EXPERIENCE_MODERATION', 'CONTACT_REQUEST', 'CV_INVITATION', 'PROFILE_FRESHNESS', 'ALUMNI_STILL_THERE', 'STUDENT_EMAIL_MIGRATION', 'APPOINTMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "StillThereChoice" AS ENUM ('YES', 'NO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Prisma üreticisi üretilmiş arama sütunlarını ve altı GIN indeksini yanlışlıkla kaldırmayı önerir.
-- Bu migration yalnız ekleyicidir. IF NOT EXISTS, yerel yarım uygulamadan kalan indeksleri de onarır.
CREATE INDEX IF NOT EXISTS "Company_normalizedName_trgm" ON "Company" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Title_normalizedName_trgm" ON "Title" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Skill_normalizedName_trgm" ON "Skill" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Sector_normalizedName_trgm" ON "Sector" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Experience_searchVector_idx" ON "Experience" USING gin ("searchVector");
CREATE INDEX IF NOT EXISTS "Experience_searchKeys_trgm" ON "Experience" USING gin ("searchKeys" gin_trgm_ops);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","type")
);

-- CreateTable
CREATE TABLE "NotificationAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "choice" "StillThereChoice",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationAction_expiresAt_idx" ON "NotificationAction"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationAction_userId_positionId_cycle_key" ON "NotificationAction"("userId", "positionId", "cycle");

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationAction" ADD CONSTRAINT "NotificationAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationAction" ADD CONSTRAINT "NotificationAction_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
