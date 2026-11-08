-- P1-10 · Randevu motoru: AvailabilityRule, Appointment ve veritabanı kısıtları (ekleyici).
-- Geri alma: DROP TABLE "Appointment"; DROP TABLE "AvailabilityRule"; DROP TYPE "AppointmentStatus";

CREATE TYPE "AppointmentStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'COMPLETED', 'NO_SHOW');

CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "mode" "MeetingMode",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "menteeId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "mode" "MeetingMode" NOT NULL,
    "menteeNote" TEXT,
    "location" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "meetUrl" TEXT,
    "calendarEventId" TEXT,
    "calendarFailedAt" TIMESTAMP(3),
    "calendarAttempts" INTEGER NOT NULL DEFAULT 0,
    "reminderSentAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledBySystem" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AvailabilityRule_mentorId_weekday_idx" ON "AvailabilityRule"("mentorId", "weekday");
CREATE INDEX "Appointment_mentorId_status_startsAt_idx" ON "Appointment"("mentorId", "status", "startsAt");
CREATE INDEX "Appointment_menteeId_status_startsAt_idx" ON "Appointment"("menteeId", "status", "startsAt");
CREATE INDEX "Appointment_status_expiresAt_idx" ON "Appointment"("status", "expiresAt");

ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_mentorId_fkey" FOREIGN KEY ("mentorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_menteeId_fkey" FOREIGN KEY ("menteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Müsaitlik: gün 1–7, dakikalar 5'in katı ve 0–1440 arası, bitiş başlangıçtan sonra.
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_shape_check" CHECK (
  "weekday" BETWEEN 1 AND 7
  AND "startMinute" BETWEEN 0 AND 1435 AND "endMinute" BETWEEN 5 AND 1440
  AND "startMinute" % 5 = 0 AND "endMinute" % 5 = 0
  AND "endMinute" > "startMinute"
);
-- Aynı mentorun aynı günündeki aralıklar çakışamaz (yan yana serbest: yarı açık aralık).
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_no_overlap"
  EXCLUDE USING gist ("mentorId" WITH =, "weekday" WITH =, int4range("startMinute", "endMinute", '[)') WITH &&);

-- Randevu şekli: mentor ≠ öğrenci, bitiş başlangıçtan sonra, notlar sınırlı, durum alanları tutarlı.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_shape_check" CHECK (
  "mentorId" <> "menteeId"
  AND "endsAt" > "startsAt"
  AND ("menteeNote" IS NULL OR char_length("menteeNote") BETWEEN 1 AND 500)
  AND ("decisionNote" IS NULL OR char_length("decisionNote") BETWEEN 1 AND 500)
  AND ("cancelReason" IS NULL OR char_length("cancelReason") BETWEEN 1 AND 500)
  AND "calendarAttempts" >= 0
  AND ("location" IS NULL OR char_length("location") BETWEEN 1 AND 300)
  AND ("meetUrl" IS NULL OR (char_length("meetUrl") <= 300 AND "meetUrl" LIKE 'https://%'))
  -- İptal: iptal eden kullanıcı ya da sistem; yalnız CANCELLED/EXPIRED'da anlamlıdır.
  AND (NOT ("cancelledById" IS NOT NULL AND "cancelledBySystem"))
  AND ("status" = 'CANCELLED' OR ("cancelledById" IS NULL AND "cancelReason" IS NULL))
  AND ("status" IN ('CANCELLED', 'EXPIRED') OR NOT "cancelledBySystem")
  -- Karar anı yalnız onay/ret/iptal/sonuçlanmış satırda; bekleyen ve süresi dolan talepte yok.
  AND (("status" IN ('REQUESTED', 'EXPIRED')) = ("decidedAt" IS NULL) OR "status" = 'CANCELLED')
);

-- Aynı mentorun bekleyen/onaylı randevuları çakışamaz; aynı öğrencinin de. Son söz veritabanıdır.
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_mentor_no_overlap"
  EXCLUDE USING gist ("mentorId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" IN ('REQUESTED', 'CONFIRMED'));
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_mentee_no_overlap"
  EXCLUDE USING gist ("menteeId" WITH =, tsrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" IN ('REQUESTED', 'CONFIRMED'));
-- Aynı öğrencinin aynı mentora yanıt bekleyen en fazla bir talebi olur.
CREATE UNIQUE INDEX "Appointment_one_open_request" ON "Appointment"("mentorId", "menteeId") WHERE "status" = 'REQUESTED';
