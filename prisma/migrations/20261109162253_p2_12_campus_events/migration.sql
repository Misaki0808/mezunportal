-- CreateEnum
CREATE TYPE "CampusEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PointAction" ADD VALUE 'EVENT_ATTENDED';

-- AlterEnum
ALTER TYPE "PointRevokeReason" ADD VALUE 'EVENT_CANCELLED';

-- AlterEnum
ALTER TYPE "PointSourceType" ADD VALUE 'CAMPUS_EVENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SuspicionRule" ADD VALUE 'EVENT_BURST';
ALTER TYPE "SuspicionRule" ADD VALUE 'EVENT_NETWORK';

-- CreateTable
CREATE TABLE "CampusEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "CampusEventStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampusEventDepartment" (
    "eventId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "CampusEventDepartment_pkey" PRIMARY KEY ("eventId","departmentId")
);

-- CreateTable
CREATE TABLE "CampusEventRegistration" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampusEventRegistration_pkey" PRIMARY KEY ("eventId","userId")
);

-- CreateTable
CREATE TABLE "EventAttendance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "networkDigest" TEXT,

    CONSTRAINT "EventAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampusEvent_status_startsAt_idx" ON "CampusEvent"("status", "startsAt");

-- CreateIndex
CREATE INDEX "CampusEventDepartment_departmentId_idx" ON "CampusEventDepartment"("departmentId");

-- CreateIndex
CREATE INDEX "CampusEventRegistration_userId_createdAt_idx" ON "CampusEventRegistration"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EventAttendance_eventId_attendedAt_idx" ON "EventAttendance"("eventId", "attendedAt");

-- CreateIndex
CREATE INDEX "EventAttendance_eventId_networkDigest_idx" ON "EventAttendance"("eventId", "networkDigest");

-- CreateIndex
CREATE INDEX "EventAttendance_userId_attendedAt_idx" ON "EventAttendance"("userId", "attendedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventAttendance_eventId_userId_key" ON "EventAttendance"("eventId", "userId");

-- AddForeignKey
ALTER TABLE "CampusEvent" ADD CONSTRAINT "CampusEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusEvent" ADD CONSTRAINT "CampusEvent_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusEventDepartment" ADD CONSTRAINT "CampusEventDepartment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CampusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusEventDepartment" ADD CONSTRAINT "CampusEventDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusEventRegistration" ADD CONSTRAINT "CampusEventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CampusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusEventRegistration" ADD CONSTRAINT "CampusEventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CampusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendance" ADD CONSTRAINT "EventAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Etkinlik zamanı ve kontenjanı doğrudan veritabanı yazımında da korunur.
ALTER TABLE "CampusEvent" ADD CONSTRAINT "CampusEvent_bounds_check" CHECK (
  "startsAt" < "endsAt" AND "capacity" BETWEEN 1 AND 10000
  AND char_length(btrim("title")) BETWEEN 3 AND 120
  AND char_length(btrim("description")) BETWEEN 10 AND 3000
  AND char_length(btrim("location")) BETWEEN 2 AND 200
);
