-- CreateTable
CREATE TABLE "SessionFeedback" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "happened" BOOLEAN NOT NULL,
    "helpful" BOOLEAN,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionFeedback_authorId_createdAt_idx" ON "SessionFeedback"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionFeedback_appointmentId_authorId_key" ON "SessionFeedback"("appointmentId", "authorId");

-- AddForeignKey
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_content_check" CHECK (("note" IS NULL OR char_length("note") BETWEEN 1 AND 1000) AND ("happened" OR "helpful" IS NULL));
