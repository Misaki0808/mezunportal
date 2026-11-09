-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "targetTitleId" TEXT;

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_targetTitleId_fkey" FOREIGN KEY ("targetTitleId") REFERENCES "Title"("id") ON DELETE SET NULL ON UPDATE CASCADE;
