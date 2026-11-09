-- CreateEnum
CREATE TYPE "AwardKind" AS ENUM ('YEAR_ALUMNI');

-- CreateTable
CREATE TABLE "AwardCycle" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "ceremonyAt" TIMESTAMP(3) NOT NULL,
    "frozenAt" TIMESTAMP(3),

    CONSTRAINT "AwardCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AwardCandidate" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "experienceCount" INTEGER NOT NULL,
    "meetingCount" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,

    CONSTRAINT "AwardCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" TEXT NOT NULL,
    "kind" "AwardKind" NOT NULL DEFAULT 'YEAR_ALUMNI',
    "cycleId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "verificationCode" TEXT NOT NULL,
    "publicConsentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AwardCycle_departmentId_year_key" ON "AwardCycle"("departmentId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "AwardCandidate_cycleId_userId_key" ON "AwardCandidate"("cycleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Award_verificationCode_key" ON "Award"("verificationCode");

-- CreateIndex
CREATE INDEX "Award_userId_idx" ON "Award"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Award_kind_departmentId_year_key" ON "Award"("kind", "departmentId", "year");

-- AddForeignKey
ALTER TABLE "AwardCycle" ADD CONSTRAINT "AwardCycle_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardCandidate" ADD CONSTRAINT "AwardCandidate_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AwardCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardCandidate" ADD CONSTRAINT "AwardCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AwardCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "University" ADD COLUMN "linkedinOrganizationId" TEXT;
