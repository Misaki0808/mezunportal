-- CreateTable
CREATE TABLE "AwardPublicationDecision" (
    "id" TEXT NOT NULL,
    "awardId" TEXT,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AwardPublicationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AwardPublicationDecision_awardId_createdAt_id_idx" ON "AwardPublicationDecision"("awardId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "AwardPublicationDecision_userId_createdAt_idx" ON "AwardPublicationDecision"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AwardPublicationDecision" ADD CONSTRAINT "AwardPublicationDecision_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "Award"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AwardPublicationDecision" ADD CONSTRAINT "AwardPublicationDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
