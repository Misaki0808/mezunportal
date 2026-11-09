-- CreateEnum
CREATE TYPE "AlumniStoryStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED');

-- CreateTable
CREATE TABLE "AlumniStory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "AlumniStoryStatus" NOT NULL DEFAULT 'DRAFT',
    "publicConsentAt" TIMESTAMP(3),
    "publicConsentVersion" TEXT,
    "moderationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "moderatedAt" TIMESTAMP(3),

    CONSTRAINT "AlumniStory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoryConsentDecision" (
    "id" TEXT NOT NULL,
    "storyId" TEXT,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryConsentDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyAlumnus" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "chosenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MonthlyAlumnus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AlumniStory_departmentId_status_idx" ON "AlumniStory"("departmentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AlumniStory_userId_departmentId_key" ON "AlumniStory"("userId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AlumniStory_id_departmentId_key" ON "AlumniStory"("id", "departmentId");

-- CreateIndex
CREATE INDEX "StoryConsentDecision_userId_createdAt_idx" ON "StoryConsentDecision"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MonthlyAlumnus_month_active_idx" ON "MonthlyAlumnus"("month", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyAlumnus_departmentId_month_key" ON "MonthlyAlumnus"("departmentId", "month");

-- AddForeignKey
ALTER TABLE "AlumniStory" ADD CONSTRAINT "AlumniStory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlumniStory" ADD CONSTRAINT "AlumniStory_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryConsentDecision" ADD CONSTRAINT "StoryConsentDecision_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "AlumniStory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoryConsentDecision" ADD CONSTRAINT "StoryConsentDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAlumnus" ADD CONSTRAINT "MonthlyAlumnus_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyAlumnus" ADD CONSTRAINT "MonthlyAlumnus_storyId_departmentId_fkey" FOREIGN KEY ("storyId", "departmentId") REFERENCES "AlumniStory"("id", "departmentId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rıza kararları yalnız eklenir; hesap silmede hikâye ilişkisi güvenle kopar.
CREATE FUNCTION "guard_story_consent_decision"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."storyId" IS NOT NULL AND NEW."storyId" IS NULL
     AND (to_jsonb(NEW) - 'storyId') = (to_jsonb(OLD) - 'storyId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'StoryConsentDecision append only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "StoryConsentDecision_append_only" BEFORE UPDATE OR DELETE ON "StoryConsentDecision"
FOR EACH ROW EXECUTE FUNCTION "guard_story_consent_decision"();
CREATE TRIGGER "StoryConsentDecision_no_truncate" BEFORE TRUNCATE ON "StoryConsentDecision"
FOR EACH STATEMENT EXECUTE FUNCTION "forbid_append_only_change"();
ALTER TABLE "StoryConsentDecision" ADD CONSTRAINT "StoryConsentDecision_version_check"
CHECK ("version" ~ '^[a-z0-9][a-z0-9.-]{0,31}$');
ALTER TABLE "MonthlyAlumnus" ADD CONSTRAINT "MonthlyAlumnus_month_check"
CHECK ("month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
