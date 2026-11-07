-- CreateEnum
CREATE TYPE "OnboardingStep" AS ENUM ('MEMBERSHIP', 'INTERESTS', 'GOALS', 'MENTOR_PREFERENCE', 'VISIBILITY', 'COMPLETE');

-- CreateEnum
CREATE TYPE "TagKind" AS ENUM ('INTEREST', 'SKILL', 'GOAL');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "headline" TEXT,
    "summary" TEXT,
    "city" TEXT,
    "goals" TEXT,
    "socialLinks" JSONB,
    "linkedinUrl" TEXT,
    "completionScore" INTEGER NOT NULL DEFAULT 0,
    "cvUpdatedAt" TIMESTAMP(3),
    "lastFreshnessPromptAt" TIMESTAMP(3),
    "lastStillThereCheckAt" TIMESTAMP(3),
    "onboardingStep" "OnboardingStep" NOT NULL DEFAULT 'MEMBERSHIP',
    "mentorInterested" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "kind" "TagKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileTag" (
    "profileId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileTag_pkey" PRIMARY KEY ("profileId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_kind_slug_key" ON "Tag"("kind", "slug");

-- CreateIndex
CREATE INDEX "ProfileTag_tagId_idx" ON "ProfileTag"("tagId");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileTag" ADD CONSTRAINT "ProfileTag_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileTag" ADD CONSTRAINT "ProfileTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
