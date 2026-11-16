-- Kart 399: tr_ascii içerir sorgularının ifade indeksleri. Yeni işlev/eklenti/veri değişikliği yok.
-- Prisma ifade indekslerini modelleyemez; kanonik ifade bu SQL'dedir.
-- Geri alma: yalnız aşağıdaki yedi indeks DROP INDEX ile kaldırılır; veri/sütun silinmez.
CREATE INDEX "User_name_tr_ascii_trgm" ON "User" USING GIN (tr_ascii("name") gin_trgm_ops);
CREATE INDEX "Profile_city_tr_ascii_trgm" ON "Profile" USING GIN (tr_ascii("city") gin_trgm_ops);
CREATE INDEX "Position_company_tr_ascii_trgm" ON "Position" USING GIN (tr_ascii("companyRaw") gin_trgm_ops) WHERE "isCurrent";
CREATE INDEX "Position_title_tr_ascii_trgm" ON "Position" USING GIN (tr_ascii("titleRaw") gin_trgm_ops) WHERE "isCurrent";
CREATE INDEX "Company_name_tr_ascii_trgm" ON "Company" USING GIN (tr_ascii("name") gin_trgm_ops);
CREATE INDEX "Title_name_tr_ascii_trgm" ON "Title" USING GIN (tr_ascii("name") gin_trgm_ops);
CREATE INDEX "Course_name_tr_ascii_trgm" ON "Course" USING GIN (tr_ascii("name") gin_trgm_ops);
