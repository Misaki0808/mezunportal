/**
 * Yönetici görev ekranı için e-posta maskesi: `ayse@ogr.iu.edu.tr` → `a***@o***.iu.edu.tr`.
 * Yönetici başvuranın ham e-postasını görmez (docs/security.md görünürlük). Geçersiz adres `***`.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const [firstLabel = '', ...rest] = domain.split('.');
  const maskedDomain = [`${firstLabel.slice(0, 1)}***`, ...rest].join('.');
  return `${local.slice(0, 1)}***@${maskedDomain}`;
}
