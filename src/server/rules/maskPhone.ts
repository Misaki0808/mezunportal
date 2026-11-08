/**
 * Yönetici ekranı için telefon maskesi: yalnız son iki rakam görünür. `0532 123 45 67` → `*** *** ** 67`.
 * Rakamdan başka karakterler atılır; dört rakamdan azı (geçersiz/eksik numara) tümüyle `***` olur.
 * Ham telefon yönetici çıktılarında bulunmaz (docs/security.md görünürlük).
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `*** *** ** ${digits.slice(-2)}`;
}
