-- AlterTable
ALTER TABLE "User" ADD COLUMN "nameSearch" TEXT GENERATED ALWAYS AS (
  trim(regexp_replace(
    regexp_replace(normalize("tr_ascii"(normalize("name", NFKC)), NFD), U&'[\0300-\036F\1AB0-\1AFF\1DC0-\1DFF\20D0-\20FF\FE20-\FE2F]', '', 'g'),
    '[^[:alnum:]]+', ' ', 'g'
  ))
) STORED;

-- CreateIndex
CREATE INDEX "User_nameSearch_trgm" ON "User" USING GIN ("nameSearch" gin_trgm_ops);
