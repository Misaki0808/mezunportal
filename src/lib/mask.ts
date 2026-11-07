/**
 * Kişisel veri maskeleme (log ve yönetici görev ekranı). Log'a e-posta/telefon ham yazılmaz
 * (AGENTS.md §3, docs/security.md “Sır ve loglama”). Maskeli değer, kişiyi tanıtmayacak kadar kısa ipucu
 * bırakır. Saf işlevlerdir.
 */

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// +90 ile ya da 0 ile başlayan Türkiye cep/sabit hat; boşluk, tire, nokta ve parantezle yazılmış olabilir.
const PHONE_PATTERN = /(?:\+90|0090|\b0)[\s.()-]*\d{3}[\s.()-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g;

/** `ayse.yilmaz@ogr.iu.edu.tr` → `a***@o***.edu.tr` (son iki alan etiketi kalır). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const labels = email.slice(at + 1).split('.');
  const tail = labels.slice(-2).join('.');
  const head = labels.length > 2 ? `${labels[0]?.charAt(0) ?? ''}***.` : '';
  return `${local.charAt(0)}***@${head}${tail}`;
}

/** Yalnız son iki rakam kalır: `+90 532 123 45 67` → `+90 5** *** ** 67`. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const last = digits.slice(-2);
  const operator = digits.slice(-10, -9);
  return `+90 ${operator}** *** ** ${last}`;
}

/** Serbest metindeki e-posta ve telefonları maskeler (log satırı, hata ayrıntısı). */
export function maskPersonalData(text: string): string {
  return text
    .replace(EMAIL_PATTERN, (match) => maskEmail(match))
    .replace(PHONE_PATTERN, (match) => maskPhone(match));
}
