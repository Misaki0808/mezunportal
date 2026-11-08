-- P1-13 · Kullanım metrikleri: Event tablosu (ekleyici). `props` kişisel veri taşımaz (CHECK ek ağdır; asıl koruma Zod strict şemalarıdır).
-- Geri alma: DROP TABLE "Event"; DROP TYPE "EventType";

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('LOGIN', 'PROFILE_THRESHOLD', 'CV_UPLOADED', 'CV_APPLIED', 'EXPERIENCE_PUBLISHED', 'SEARCH', 'MENTOR_SEARCH', 'MENTOR_VIEWED', 'APPOINTMENT_REQUESTED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_COMPLETED', 'FAQ_REQUESTED', 'FAQ_PUBLISHED', 'CV_REVIEW_REQUESTED', 'CONTACT_REQUESTED');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "userId" TEXT,
    "role" "MembershipRole",
    "departmentId" TEXT,
    "props" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_type_createdAt_idx" ON "Event"("type", "createdAt");

-- CreateIndex
CREATE INDEX "Event_departmentId_createdAt_idx" ON "Event"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "Event_userId_createdAt_idx" ON "Event"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Ek ağ: props düz bir nesne, kısa; e-posta (@) ya da 10+ ardışık rakam (telefon/kimlik) içermez.
ALTER TABLE "Event" ADD CONSTRAINT "Event_props_check" CHECK (
  jsonb_typeof("props") = 'object'
  AND char_length("props"::text) <= 500
  AND "props"::text !~ '@'
  AND "props"::text !~ '[0-9]{10,}'
);
