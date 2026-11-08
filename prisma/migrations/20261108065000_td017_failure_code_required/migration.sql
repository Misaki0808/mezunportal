-- SQL CHECK, NULL sonucunu kabul eder: FAILED için hata kodu ayrıca zorunludur.
ALTER TABLE "NotificationIntent" ADD CONSTRAINT "NotificationIntent_failure_code_required" CHECK (
  "status" <> 'FAILED' OR "failureCode" IS NOT NULL
);
-- Geri alma (veri değiştirmez): ALTER TABLE "NotificationIntent" DROP CONSTRAINT "NotificationIntent_failure_code_required";
