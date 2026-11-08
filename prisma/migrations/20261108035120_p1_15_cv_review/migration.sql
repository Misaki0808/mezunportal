-- CreateEnum
CREATE TYPE "CvReviewRequestStatus" AS ENUM ('OPEN', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "CvReviewRequest" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "cvUploadId" TEXT NOT NULL,
    "status" "CvReviewRequestStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "helpfulAt" TIMESTAMP(3),

    CONSTRAINT "CvReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CvReviewRequest_mentorId_createdAt_idx" ON "CvReviewRequest"("mentorId", "createdAt");

-- CreateIndex
CREATE INDEX "CvReviewRequest_studentId_createdAt_idx" ON "CvReviewRequest"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "CvReviewRequest_status_expiresAt_idx" ON "CvReviewRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "CvReviewRequest_cvUploadId_status_idx" ON "CvReviewRequest"("cvUploadId", "status");

-- AddForeignKey
ALTER TABLE "CvReviewRequest" ADD CONSTRAINT "CvReviewRequest_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvReviewRequest" ADD CONSTRAINT "CvReviewRequest_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvReviewRequest" ADD CONSTRAINT "CvReviewRequest_cvUploadId_fkey" FOREIGN KEY ("cvUploadId") REFERENCES "CvUpload"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Aynı öğrenci ve mentorda tek açık talep.
CREATE UNIQUE INDEX "CvReviewRequest_open_pair_key" ON "CvReviewRequest" ("studentId", "mentorId") WHERE "status" = 'OPEN';
