-- CreateEnum
CREATE TYPE "ExperienceType" AS ENUM ('INTERNSHIP', 'ERASMUS', 'COMPETITION', 'HACKATHON', 'CLUB', 'CERTIFICATE', 'GRADUATE_STUDY', 'STUDY_ABROAD');

-- CreateEnum
CREATE TYPE "ExperienceStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TermSeason" AS ENUM ('SPRING', 'SUMMER', 'AUTUMN', 'WINTER');

-- CreateEnum
CREATE TYPE "ExperiencePay" AS ENUM ('PAID', 'UNPAID', 'NOT_DISCLOSED');

-- CreateEnum
CREATE TYPE "ApplicationChannel" AS ENUM ('LINKEDIN_POST', 'CAREER_PLATFORM', 'COMPANY_SITE', 'REFERRAL', 'CAREER_FAIR', 'COLD_EMAIL', 'UNIVERSITY_ANNOUNCEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('EXPERIENCE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "authorId" TEXT,
    "departmentIdAtWrite" TEXT NOT NULL,
    "type" "ExperienceType" NOT NULL,
    "companyId" TEXT,
    "organizationName" TEXT,
    "country" TEXT,
    "city" TEXT,
    "termYear" INTEGER,
    "termSeason" "TermSeason",
    "durationWeeks" INTEGER,
    "pay" "ExperiencePay",
    "applicationChannel" "ApplicationChannel",
    "processSteps" JSONB NOT NULL DEFAULT '[]',
    "interviewQuestions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whatLearned" TEXT NOT NULL DEFAULT '',
    "advice" TEXT NOT NULL DEFAULT '',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExperienceStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationNote" TEXT,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL DEFAULT 'EXPERIENCE',
    "targetId" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Experience_authorId_updatedAt_idx" ON "Experience"("authorId", "updatedAt");

-- CreateIndex
CREATE INDEX "Experience_departmentIdAtWrite_status_createdAt_idx" ON "Experience"("departmentIdAtWrite", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Experience_status_publishedAt_idx" ON "Experience"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Experience_type_termYear_idx" ON "Experience"("type", "termYear");

-- CreateIndex
CREATE INDEX "Report_targetId_status_idx" ON "Report"("targetId", "status");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reporterId_idx" ON "Report"("reporterId");

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_departmentIdAtWrite_fkey" FOREIGN KEY ("departmentIdAtWrite") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma'nın ifade edemediği JSON/dizi, tür-alan, moderasyon ve açık şikâyet kısıtları.
CREATE FUNCTION "experience_process_steps_valid"(steps JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF jsonb_typeof(steps) <> 'array' THEN RETURN FALSE; END IF;
  IF jsonb_array_length(steps) > 20 THEN RETURN FALSE; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(steps) AS item
    WHERE jsonb_typeof(item) <> 'object'
      OR jsonb_typeof(item->'title') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'description') IS DISTINCT FROM 'string'
      OR char_length(btrim(item->>'title')) NOT BETWEEN 1 AND 200
      OR char_length(btrim(item->>'description')) NOT BETWEEN 1 AND 2000
      OR (item - 'title' - 'description') <> '{}'::jsonb
  );
END;
$$;


CREATE FUNCTION "experience_questions_valid"(questions TEXT[]) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT NOT EXISTS (SELECT 1 FROM unnest(questions) AS question
    WHERE question IS NULL OR char_length(btrim(question)) NOT BETWEEN 1 AND 1000);
$$;

ALTER TABLE "Experience"
  ADD CONSTRAINT "Experience_author_check" CHECK (
    "authorId" IS NOT NULL OR ("isAnonymous" AND "status" = 'PUBLISHED')
  ),
  ADD CONSTRAINT "Experience_bounds_check" CHECK (
    ("organizationName" IS NULL OR char_length(btrim("organizationName")) BETWEEN 1 AND 200)
    AND ("country" IS NULL OR char_length(btrim("country")) BETWEEN 1 AND 200)
    AND ("city" IS NULL OR char_length(btrim("city")) BETWEEN 1 AND 200)
    AND ("companyId" IS NULL OR char_length(btrim("companyId")) BETWEEN 1 AND 64)
    AND ("termYear" IS NULL OR "termYear" BETWEEN 1900 AND 2100)
    AND ("durationWeeks" IS NULL OR "durationWeeks" BETWEEN 1 AND 520)
    AND char_length("whatLearned") <= 10000 AND char_length("advice") <= 10000
  ),
  ADD CONSTRAINT "Experience_process_check" CHECK ("experience_process_steps_valid"("processSteps")),
  ADD CONSTRAINT "Experience_questions_check" CHECK (
    cardinality("interviewQuestions") <= 20
    AND (cardinality("interviewQuestions") = 0 OR array_ndims("interviewQuestions") = 1)
    AND array_position("interviewQuestions", NULL) IS NULL
    AND "experience_questions_valid"("interviewQuestions")
  ),
  ADD CONSTRAINT "Experience_type_fields_check" CHECK (
    ("type" = 'INTERNSHIP' OR ("pay" IS NULL AND "companyId" IS NULL))
    AND ("type" IN ('INTERNSHIP', 'GRADUATE_STUDY') OR cardinality("interviewQuestions") = 0)
    AND ("type" NOT IN ('CLUB', 'CERTIFICATE') OR ("applicationChannel" IS NULL AND "country" IS NULL))
    AND ("type" <> 'CERTIFICATE' OR ("city" IS NULL AND "processSteps" = '[]'::jsonb))
  ),
  ADD CONSTRAINT "Experience_ready_check" CHECK (
    "status" = 'DRAFT' OR (
      "organizationName" IS NOT NULL AND "termYear" IS NOT NULL AND "termSeason" IS NOT NULL
      AND char_length(btrim("whatLearned")) >= 1 AND char_length(btrim("advice")) >= 1
      AND ("type" NOT IN ('INTERNSHIP', 'ERASMUS', 'STUDY_ABROAD') OR "durationWeeks" IS NOT NULL)
      AND ("type" <> 'INTERNSHIP' OR "pay" IS NOT NULL)
      AND ("type" IN ('CLUB', 'CERTIFICATE') OR "applicationChannel" IS NOT NULL)
      AND ("type" NOT IN ('ERASMUS', 'STUDY_ABROAD') OR "country" IS NOT NULL)
    )
  ),
  ADD CONSTRAINT "Experience_moderation_check" CHECK (
    ("status" IN ('DRAFT', 'PENDING') AND "moderatedById" IS NULL AND "moderatedAt" IS NULL AND "moderationNote" IS NULL AND "publishedAt" IS NULL)
    OR ("status" = 'PUBLISHED' AND "moderatedById" IS NOT NULL AND "moderatedAt" IS NOT NULL AND "publishedAt" IS NOT NULL AND "moderationNote" IS NULL)
    OR ("status" = 'REJECTED' AND "moderatedById" IS NOT NULL AND "moderatedAt" IS NOT NULL AND "publishedAt" IS NULL
      AND "moderationNote" IS NOT NULL AND char_length(btrim("moderationNote")) BETWEEN 3 AND 1000)
  );

-- Aynı kullanıcı/hedef için tek AÇIK şikâyet; kapalı geçmiş yeni şikâyeti engellemez.
CREATE UNIQUE INDEX "Report_one_open_per_reporter_target" ON "Report" ("reporterId", "targetType", "targetId")
  WHERE "status" = 'OPEN' AND "reporterId" IS NOT NULL;
ALTER TABLE "Report"
  ADD CONSTRAINT "Report_reason_check" CHECK (char_length(btrim("reason")) BETWEEN 3 AND 1000),
  ADD CONSTRAINT "Report_resolution_check" CHECK (
    ("status" = 'OPEN' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "resolutionNote" IS NULL)
    OR ("status" IN ('RESOLVED', 'DISMISSED') AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL
      AND "resolutionNote" IS NOT NULL AND char_length(btrim("resolutionNote")) BETWEEN 3 AND 1000)
  );
