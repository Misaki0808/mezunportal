-- AlterEnum
ALTER TYPE "ConsentDocument" ADD VALUE 'PROFILE_PHOTO_VISIBILITY';

-- CreateTable
CREATE TABLE "ProfilePhoto" (
    "userId" TEXT NOT NULL,
    "largeKey" TEXT NOT NULL,
    "smallKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProfilePhoto_largeKey_key" ON "ProfilePhoto"("largeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProfilePhoto_smallKey_key" ON "ProfilePhoto"("smallKey");

-- AddForeignKey
ALTER TABLE "ProfilePhoto" ADD CONSTRAINT "ProfilePhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
