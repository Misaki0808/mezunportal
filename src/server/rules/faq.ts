import { looksLikePersonalData } from './adminAudit';

/**
 * SSS gizlilik kuralları (saf). Yayında hiçbir isim/kimlik olmamalıdır: yayın metni, talebe dahil herkesin
 * (soran, cevap yazanlar) adını/soyadını ve e-posta/telefon/kimlik numarası biçimini içeremez. Denetim bilinçli olarak
 * katıdır (yanlış alarm moderatörün metni düzeltmesiyle çözülür; sızıntı geri alınamaz).
 */

/** Türkçe katlama: İ→i, I→ı, aksanlar düşer; karşılaştırma büyük/küçük harf ve aksandan bağımsızdır. */
export function foldTr(value: string): string {
  return value
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[ıçğöşüâîû]/g, (char) => 'icgosuaiu'['ıçğöşüâîû'.indexOf(char)] ?? char);
}

const WORD = /[\p{L}\p{N}]+/gu;
/** Bu uzunluktan kısa ad sözcükleri ("Ali" hariç 3 harf dahil) tam eşleşmeyle; 4+ harfli adda ek almış biçim de yakalanır. */
const MIN_NAME_TOKEN = 3;
const SUFFIX_MIN_LENGTH = 4;

export function nameTokens(names: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const name of names)
    for (const token of foldTr(name).match(WORD) ?? [])
      if (token.length >= MIN_NAME_TOKEN) tokens.add(token);
  return [...tokens];
}

/**
 * Metin, verilen adlardan birini ("Ahmet", "Ahmet'e", "ahmete") ya da e-posta/telefon/kimlik numarası biçimini içeriyorsa
 * `true`. Ek almış biçim, 4+ harfli ad sözcüğü için önek eşleşmesiyle yakalanır.
 */
export function findIdentityLeak(text: string, names: readonly string[]): boolean {
  if (looksLikePersonalData(text)) return true;
  const words = foldTr(text).match(WORD) ?? [];
  return nameTokens(names).some((token) =>
    words.some(
      (word) => word === token || (token.length >= SUFFIX_MIN_LENGTH && word.startsWith(token)),
    ),
  );
}

/** Talep/cevap metninde yayına girmeden önce reddedilen kişisel veri biçimleri (e-posta, telefon, kimlik numarası). */
export function hasPersonalDataPattern(text: string): boolean {
  return looksLikePersonalData(text);
}
