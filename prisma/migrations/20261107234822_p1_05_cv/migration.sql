-- CreateEnum
CREATE TYPE "CvStatus" AS ENUM ('QUEUED', 'PARSING', 'PARSED', 'FAILED', 'APPLIED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT', 'FREELANCE', 'VOLUNTEER', 'OTHER');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('HIGH_SCHOOL', 'ASSOCIATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'OTHER');

-- CreateEnum
CREATE TYPE "LanguageLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'NATIVE');

-- CreateEnum
CREATE TYPE "ProfileEntrySource" AS ENUM ('CV', 'MANUAL');

-- CreateEnum
CREATE TYPE "DictionaryKind" AS ENUM ('COMPANY', 'TITLE', 'SKILL', 'SECTOR');

-- CreateEnum
CREATE TYPE "ExperienceInvitationStatus" AS ENUM ('OPEN', 'DISMISSED');

-- CreateTable
CREATE TABLE "CvUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT,
    "byteSize" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "status" "CvStatus" NOT NULL DEFAULT 'QUEUED',
    "parsedJson" JSONB,
    "errorCode" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CvUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[],
    "sectorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "aliases" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnmatchedValue" (
    "id" TEXT NOT NULL,
    "kind" "DictionaryKind" NOT NULL,
    "rawValue" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resolvedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnmatchedValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Education" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "level" "EducationLevel",
    "fieldOfStudy" TEXT,
    "startYear" INTEGER,
    "startMonth" INTEGER,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "source" "ProfileEntrySource" NOT NULL,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "companyRaw" TEXT NOT NULL,
    "titleId" TEXT,
    "titleRaw" TEXT NOT NULL,
    "sectorId" TEXT,
    "employmentType" "EmploymentType",
    "startYear" INTEGER,
    "startMonth" INTEGER,
    "endYear" INTEGER,
    "endMonth" INTEGER,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "source" "ProfileEntrySource" NOT NULL,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "level" "LanguageLevel",
    "source" "ProfileEntrySource" NOT NULL,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedYear" INTEGER,
    "issuedMonth" INTEGER,
    "source" "ProfileEntrySource" NOT NULL,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillId" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "source" "ProfileEntrySource" NOT NULL,
    "manuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceInvitation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "status" "ExperienceInvitationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExperienceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CvUpload_userId_createdAt_idx" ON "CvUpload"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_normalizedName_key" ON "Sector"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Company_normalizedName_key" ON "Company"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Title_normalizedName_key" ON "Title"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_normalizedName_key" ON "Skill"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "UnmatchedValue_kind_normalizedValue_key" ON "UnmatchedValue"("kind", "normalizedValue");

-- CreateIndex
CREATE INDEX "Education_userId_idx" ON "Education"("userId");

-- CreateIndex
CREATE INDEX "Position_userId_idx" ON "Position"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Language_userId_normalizedName_key" ON "Language"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "Certification_userId_idx" ON "Certification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSkill_userId_normalizedName_key" ON "UserSkill"("userId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "ExperienceInvitation_positionId_key" ON "ExperienceInvitation"("positionId");

-- CreateIndex
CREATE INDEX "ExperienceInvitation_userId_status_idx" ON "ExperienceInvitation"("userId", "status");

-- AddForeignKey
ALTER TABLE "CvUpload" ADD CONSTRAINT "CvUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Language" ADD CONSTRAINT "Language_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceInvitation" ADD CONSTRAINT "ExperienceInvitation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceInvitation" ADD CONSTRAINT "ExperienceInvitation_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- Ham SQL (Prisma ifade edemez; docs/data.md "Migration politikası"). Ekleyici: veri silmez/değiştirmez.
-- Geri alma: DROP TABLE "ExperienceInvitation", "UserSkill", "Certification", "Language", "Position",
--   "Education", "UnmatchedValue", "Skill", "Title", "Company", "Sector", "CvUpload";
--   DROP TYPE "ExperienceInvitationStatus", "DictionaryKind", "ProfileEntrySource", "LanguageLevel",
--   "EducationLevel", "EmploymentType", "CvStatus";
-- ---------------------------------------------------------------------------------------------

-- CV yaşam döngüsü: ayrıştırma çıktısı yalnız PARSED'dadır, hata kodu yalnız FAILED'dadır.
ALTER TABLE "CvUpload" ADD CONSTRAINT "CvUpload_state_check" CHECK (
  ("status" = 'PARSED') = ("parsedJson" IS NOT NULL)
  AND ("status" = 'FAILED') = ("errorCode" IS NOT NULL)
  AND ("status" <> 'APPLIED' OR "appliedAt" IS NOT NULL)
  AND ("status" NOT IN ('QUEUED', 'PARSING', 'PARSED') OR "storageKey" IS NOT NULL)
);
ALTER TABLE "CvUpload" ADD CONSTRAINT "CvUpload_size_check" CHECK (
  "byteSize" BETWEEN 1 AND 5242880 AND "pageCount" BETWEEN 1 AND 6 AND "attempts" >= 0
);
ALTER TABLE "CvUpload" ADD CONSTRAINT "CvUpload_storageKey_check" CHECK (
  "storageKey" IS NULL OR "storageKey" ~ '^cv/[A-Za-z0-9_-]{1,64}/[A-Za-z0-9_-]{1,64}\.pdf$'
);
-- Kullanıcı başına en fazla bir işlenen CV (üst üste yükleme yok) ve en fazla bir onay bekleyen CV.
CREATE UNIQUE INDEX "CvUpload_one_inflight_per_user" ON "CvUpload" ("userId")
  WHERE "status" IN ('QUEUED', 'PARSING');
CREATE UNIQUE INDEX "CvUpload_one_parsed_per_user" ON "CvUpload" ("userId")
  WHERE "status" = 'PARSED';
-- Dosya temizleme işi (files.purge) yalnız dosyası duran satırları tarar.
CREATE INDEX "CvUpload_stored_files_idx" ON "CvUpload" ("updatedAt") WHERE "storageKey" IS NOT NULL;

-- Tarih alanları: ay 1–12, yıl makul aralıkta, bitiş başlangıçtan önce olamaz, süren kalemin bitişi yoktur.
ALTER TABLE "Position" ADD CONSTRAINT "Position_dates_check" CHECK (
  ("startMonth" IS NULL OR ("startMonth" BETWEEN 1 AND 12 AND "startYear" IS NOT NULL))
  AND ("endMonth" IS NULL OR ("endMonth" BETWEEN 1 AND 12 AND "endYear" IS NOT NULL))
  AND ("startYear" IS NULL OR "startYear" BETWEEN 1950 AND 2100)
  AND ("endYear" IS NULL OR "endYear" BETWEEN 1950 AND 2100)
  AND ("startYear" IS NULL OR "endYear" IS NULL
       OR ("endYear" * 12 + COALESCE("endMonth", 12)) >= ("startYear" * 12 + COALESCE("startMonth", 1)))
  AND (NOT "isCurrent" OR "endYear" IS NULL)
);
ALTER TABLE "Education" ADD CONSTRAINT "Education_dates_check" CHECK (
  ("startMonth" IS NULL OR ("startMonth" BETWEEN 1 AND 12 AND "startYear" IS NOT NULL))
  AND ("endMonth" IS NULL OR ("endMonth" BETWEEN 1 AND 12 AND "endYear" IS NOT NULL))
  AND ("startYear" IS NULL OR "startYear" BETWEEN 1950 AND 2100)
  AND ("endYear" IS NULL OR "endYear" BETWEEN 1950 AND 2100)
  AND ("startYear" IS NULL OR "endYear" IS NULL
       OR ("endYear" * 12 + COALESCE("endMonth", 12)) >= ("startYear" * 12 + COALESCE("startMonth", 1)))
  AND (NOT "isCurrent" OR "endYear" IS NULL)
);
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_dates_check" CHECK (
  ("issuedMonth" IS NULL OR ("issuedMonth" BETWEEN 1 AND 12 AND "issuedYear" IS NOT NULL))
  AND ("issuedYear" IS NULL OR "issuedYear" BETWEEN 1950 AND 2100)
);

-- Metin uzunlukları (sözleşmedeki sınırların veritabanı karşılığı; LLM çıktısı sınırsız metin yazamaz).
ALTER TABLE "Position" ADD CONSTRAINT "Position_text_check" CHECK (
  char_length("companyRaw") BETWEEN 1 AND 200 AND char_length("titleRaw") BETWEEN 1 AND 200
  AND ("description" IS NULL OR char_length("description") <= 1000)
);
ALTER TABLE "Education" ADD CONSTRAINT "Education_text_check" CHECK (
  char_length("institution") BETWEEN 1 AND 200
  AND ("fieldOfStudy" IS NULL OR char_length("fieldOfStudy") <= 200)
);
ALTER TABLE "Language" ADD CONSTRAINT "Language_text_check" CHECK (char_length("name") BETWEEN 1 AND 60);
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_text_check" CHECK (
  char_length("name") BETWEEN 1 AND 200 AND ("issuer" IS NULL OR char_length("issuer") <= 200)
);
ALTER TABLE "UserSkill" ADD CONSTRAINT "UserSkill_text_check" CHECK (char_length("name") BETWEEN 1 AND 80);
ALTER TABLE "UnmatchedValue" ADD CONSTRAINT "UnmatchedValue_count_check" CHECK ("count" >= 1);

-- Bulanık eşleme (pg_trgm, init migration'ında etkin): sözlük adlarında benzerlik araması.
CREATE INDEX "Company_normalizedName_trgm" ON "Company" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX "Title_normalizedName_trgm" ON "Title" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX "Skill_normalizedName_trgm" ON "Skill" USING gin ("normalizedName" gin_trgm_ops);
CREATE INDEX "Sector_normalizedName_trgm" ON "Sector" USING gin ("normalizedName" gin_trgm_ops);
