-- CreateEnum
CREATE TYPE "CvUploadSource" AS ENUM ('CV', 'LINKEDIN_PDF');

-- AlterTable
ALTER TABLE "CvUpload" ADD COLUMN     "source" "CvUploadSource" NOT NULL DEFAULT 'CV';
