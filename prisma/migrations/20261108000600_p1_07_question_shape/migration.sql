-- Prisma String[] sütunu PostgreSQL'de NULL olabilir. Yeni Experience tablosunda NULL ve çok boyutlu
-- diziyi açıkça kapat; ilk uygulanmış migration'ın checksum'ını değiştirme.
ALTER TABLE "Experience" ALTER COLUMN "interviewQuestions" SET NOT NULL;
CREATE OR REPLACE FUNCTION "experience_questions_valid"(questions TEXT[]) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE CALLED ON NULL INPUT AS $$
BEGIN
  IF questions IS NULL THEN RETURN FALSE; END IF;
  IF cardinality(questions) > 20 OR array_ndims(questions) > 1 THEN RETURN FALSE; END IF;
  RETURN NOT EXISTS (SELECT 1 FROM unnest(questions) AS question
    WHERE question IS NULL OR char_length(btrim(question)) NOT BETWEEN 1 AND 1000);
END;
$$;
ALTER TABLE "Experience" DROP CONSTRAINT "Experience_questions_check";
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_questions_check"
  CHECK ("experience_questions_valid"("interviewQuestions"));
