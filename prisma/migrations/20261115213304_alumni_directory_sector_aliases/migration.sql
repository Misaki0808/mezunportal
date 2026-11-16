-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "alumniDirectoryVisible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Sector" ADD COLUMN     "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];
