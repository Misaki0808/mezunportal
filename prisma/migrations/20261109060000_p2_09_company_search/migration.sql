-- AlterTable
ALTER TABLE "Company" ADD COLUMN "searchKeys" TEXT GENERATED ALWAYS AS ("tr_ascii"("name" || ' ' || "text_array_join"("aliases"))) STORED;

-- CreateTable
CREATE TABLE "CompanyMerge" (
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyMerge_pkey" PRIMARY KEY ("sourceId")
);

-- CreateIndex
CREATE INDEX "CompanyMerge_targetId_idx" ON "CompanyMerge"("targetId");

-- CreateIndex
CREATE INDEX "Company_searchKeys_trgm" ON "Company" USING GIN ("searchKeys" gin_trgm_ops);
