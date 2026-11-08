-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PROPOSED', 'STUDENT_CONFIRMED', 'APPROVED', 'REJECTED', 'CANCELLED', 'ACCEPTED_PROPOSED', 'ACCEPTED_ALUMNI_CONFIRMED', 'ACCEPTED_APPROVED', 'ACCEPTED_REJECTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REFERRAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PointAction" ADD VALUE 'REFERRAL_GIVEN';
ALTER TYPE "PointAction" ADD VALUE 'REFERRAL_ACCEPTED';

-- AlterEnum
ALTER TYPE "PointRevokeReason" ADD VALUE 'REFERRAL_CANCELLED';

-- AlterEnum
ALTER TYPE "PointSourceType" ADD VALUE 'REFERRAL';

-- CreateTable
CREATE TABLE "ReferralClaim" (
    "id" TEXT NOT NULL,
    "alumnusId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "departmentIdAtWrite" TEXT NOT NULL,
    "jobPostingId" TEXT,
    "organizationName" TEXT,
    "note" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PROPOSED',
    "studentConfirmedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "acceptanceNote" TEXT,
    "acceptanceProposedAt" TIMESTAMP(3),
    "alumniConfirmedAt" TIMESTAMP(3),
    "acceptanceReviewedById" TEXT,
    "acceptanceReviewedAt" TIMESTAMP(3),
    "acceptanceReason" TEXT,
    "acceptanceApprovedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReferralClaim_alumnusId_createdAt_idx" ON "ReferralClaim"("alumnusId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralClaim_studentId_status_createdAt_idx" ON "ReferralClaim"("studentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralClaim_departmentIdAtWrite_status_createdAt_idx" ON "ReferralClaim"("departmentIdAtWrite", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralClaim_jobPostingId_idx" ON "ReferralClaim"("jobPostingId");

-- AddForeignKey
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_alumnusId_fkey" FOREIGN KEY ("alumnusId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_departmentIdAtWrite_fkey" FOREIGN KEY ("departmentIdAtWrite") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_jobPostingId_fkey" FOREIGN KEY ("jobPostingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_acceptanceReviewedById_fkey" FOREIGN KEY ("acceptanceReviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Kişi kendisine referans veremez; notlar ve kurum sınırları istemci dışındaki yazımlarda da korunur.
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_distinct_people_check"
  CHECK ("alumnusId" <> "studentId");
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_notes_check"
  CHECK (("note" IS NULL OR char_length("note") <= 500)
    AND ("acceptanceNote" IS NULL OR char_length("acceptanceNote") <= 500)
    AND ("organizationName" IS NULL OR char_length("organizationName") BETWEEN 2 AND 120));
ALTER TABLE "ReferralClaim" ADD CONSTRAINT "ReferralClaim_order_check"
  CHECK (("status" NOT IN ('STUDENT_CONFIRMED', 'APPROVED', 'ACCEPTED_PROPOSED', 'ACCEPTED_ALUMNI_CONFIRMED', 'ACCEPTED_APPROVED', 'ACCEPTED_REJECTED') OR "studentConfirmedAt" IS NOT NULL)
    AND ("status" NOT IN ('APPROVED', 'ACCEPTED_PROPOSED', 'ACCEPTED_ALUMNI_CONFIRMED', 'ACCEPTED_APPROVED', 'ACCEPTED_REJECTED') OR "approvedAt" IS NOT NULL)
    AND ("status" NOT IN ('ACCEPTED_PROPOSED', 'ACCEPTED_ALUMNI_CONFIRMED', 'ACCEPTED_APPROVED', 'ACCEPTED_REJECTED') OR "acceptanceProposedAt" IS NOT NULL)
    AND ("status" NOT IN ('ACCEPTED_ALUMNI_CONFIRMED', 'ACCEPTED_APPROVED') OR "alumniConfirmedAt" IS NOT NULL)
    AND ("status" <> 'ACCEPTED_APPROVED' OR "acceptanceApprovedAt" IS NOT NULL));
