-- CreateEnum
CREATE TYPE "FeedbackAnswer" AS ENUM ('POSITIVE', 'PARTIAL', 'NEGATIVE');

-- AlterTable
ALTER TABLE "SessionFeedback" ADD COLUMN     "answerOne" "FeedbackAnswer",
ADD COLUMN     "answerThree" "FeedbackAnswer",
ADD COLUMN     "answerTwo" "FeedbackAnswer",
ADD COLUMN     "ratingHalf" SMALLINT;

-- Yarım puan birimi: 1 = 0,5; 10 = 5. Önceki satırlar NULL kalır.
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_ratingHalf_range"
  CHECK ("ratingHalf" IS NULL OR "ratingHalf" BETWEEN 1 AND 10);
