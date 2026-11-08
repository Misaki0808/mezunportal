-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'JOB_MATCH';

-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN     "targetGrades" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "JobPostingTag" (
    "postingId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "JobPostingTag_pkey" PRIMARY KEY ("postingId","tagId")
);

-- CreateIndex
CREATE INDEX "JobPostingTag_tagId_idx" ON "JobPostingTag"("tagId");

-- AddForeignKey
ALTER TABLE "JobPostingTag" ADD CONSTRAINT "JobPostingTag_postingId_fkey" FOREIGN KEY ("postingId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPostingTag" ADD CONSTRAINT "JobPostingTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
