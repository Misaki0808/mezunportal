const collator = new Intl.Collator('tr');

/** Türkçe harf sırası (ç, ğ, ı/i, ö, ş, ü doğru yere oturur); veritabanı harmanlamasından bağımsızdır. */
export const compareTurkish = (a: string, b: string): number => collator.compare(a, b);

/**
 * Küçük, sayfalanmayan seçenek listelerini (sektör, şirket, bölüm açılır listeleri) Türkçe sıraya koyar. Eşit adlarda
 * girdi sırası (sorgudaki ikincil anahtar) korunur. Sayfalanan ve büyük listeler için sorgu düzeyinde harmanlama kullanılır.
 */
export function sortByTurkishName<T extends { name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => compareTurkish(a.name, b.name));
}
