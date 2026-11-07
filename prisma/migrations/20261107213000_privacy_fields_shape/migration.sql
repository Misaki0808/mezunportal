-- P1-03 sözleşme incelemesi: NULL CHECK'i aşamaz; alan listesi tek boyutludur.
-- Veri silmez/değiştirmez. Geri alma:
-- ALTER TABLE "ContactRequest" DROP CONSTRAINT "ContactRequest_fields_shape_check";
ALTER TABLE "ContactRequest" ADD CONSTRAINT "ContactRequest_fields_shape_check"
  CHECK ("fields" IS NOT NULL AND array_ndims("fields") = 1);
