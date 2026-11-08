-- P1-12 ekleyici migration. Geri alma (yalnız açık onayla): NotificationAction ve
-- NotificationPreference tablolarını, ardından StillThereChoice ve NotificationType enumlarını kaldır.
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACCOUNT_SECURITY', 'GRADUATION_DECISION', 'EXPERIENCE_MODERATION', 'CONTACT_REQUEST', 'CV_INVITATION', 'PROFILE_FRESHNESS', 'ALUMNI_STILL_THERE', 'STUDENT_EMAIL_MIGRATION', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "StillThereChoice" AS ENUM ('YES', 'NO');

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
