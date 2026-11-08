-- P1-17 · SSS bildirim türü (ekleyici). Geri alma: enum değeri kaldırılamaz; kullanılmayan değer zararsızdır
-- (geri almak için NotificationType yeniden oluşturulur; tercih satırları 'FAQ' ise önce silinir).
ALTER TYPE "NotificationType" ADD VALUE 'FAQ';
