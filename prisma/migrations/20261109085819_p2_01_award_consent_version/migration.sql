-- AlterTable
ALTER TABLE "Award" ADD COLUMN     "publicConsentVersion" TEXT;

-- Karar kanıtı yalnız eklenir; ödül silindiğinde FK'nin yaptığı awardId → NULL temizliği hariç.
CREATE FUNCTION "guard_award_publication_decision"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD."awardId" IS NOT NULL AND NEW."awardId" IS NULL
     AND (to_jsonb(NEW) - 'awardId') = (to_jsonb(OLD) - 'awardId') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AwardPublicationDecision append only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AwardPublicationDecision_append_only" BEFORE UPDATE OR DELETE ON "AwardPublicationDecision"
FOR EACH ROW EXECUTE FUNCTION "guard_award_publication_decision"();
CREATE TRIGGER "AwardPublicationDecision_no_truncate" BEFORE TRUNCATE ON "AwardPublicationDecision"
FOR EACH STATEMENT EXECUTE FUNCTION "forbid_append_only_change"();
ALTER TABLE "AwardPublicationDecision" ADD CONSTRAINT "AwardPublicationDecision_version_check"
CHECK ("version" ~ '^[a-z0-9][a-z0-9.-]{0,31}$');
