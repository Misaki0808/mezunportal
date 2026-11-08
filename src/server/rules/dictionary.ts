import { cleanCvText } from '@/contracts/cv';

/**
 * Sözlük adı normalleştirme (saf). Şirket/unvan/beceri/sektör adları sözlükte ve eşlemede aynı biçime
 * indirgenir: Türkçe küçük harf (`İ`→`i`, `I`→`ı`), Türkçe harfler ASCII'ye (`ğüşöçı`→`gusoci`), aksanlar
 * atılır, noktalama boşluk olur, `&` → `ve`. Şirketlerde sondaki hukuki ek (`A.Ş.`, `Ltd. Şti.`, `Inc`) düşer.
 */

/** `pg_trgm` benzerlik eşiği (0–1). Altı eşleşmez, değer ham kalır ve yönetici kuyruğuna düşer. */
export const DICTIONARY_MATCH_THRESHOLD = 0.55;

export const DICTIONARY_KINDS = ['COMPANY', 'TITLE', 'SKILL', 'SECTOR'] as const;
export type DictionaryKindName = (typeof DICTIONARY_KINDS)[number];

const TURKISH_FOLD: Readonly<Record<string, string>> = {
  ı: 'i',
  ğ: 'g',
  ü: 'u',
  ş: 's',
  ö: 'o',
  ç: 'c',
};

const LEGAL_SUFFIX_TOKENS = new Set([
  'as',
  'anonim',
  'sirketi',
  'ltd',
  'sti',
  'limited',
  'inc',
  'llc',
  'gmbh',
  'corp',
  'corporation',
  'co',
  'plc',
  'ag',
]);

export const NORMALIZED_NAME_MAX = 200;

export function normalizeName(value: string, kind?: DictionaryKindName): string {
  const folded = cleanCvText(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[ığüşöç]/g, (char) => TURKISH_FOLD[char] ?? char)
    // "A.Ş." → "as", "Ltd. Şti." → "ltd sti": harfler arası nokta atılır, kalan noktalama boşluk olur.
    .replace(/\./g, '')
    .replace(/&/g, ' ve ')
    .replace(/[^a-z0-9+#]+/g, ' ')
    .trim();
  let tokens = folded.split(' ').filter(Boolean);
  if (kind === 'COMPANY') {
    // "A. Ş." gibi ayrık yazım: sondaki tek harfli "a s" ikilisi de hukuki ek sayılır.
    if (tokens.length > 2 && tokens.at(-2) === 'a' && tokens.at(-1) === 's')
      tokens = tokens.slice(0, -2);
    while (tokens.length > 1 && LEGAL_SUFFIX_TOKENS.has(tokens.at(-1) ?? '')) tokens.pop();
  }
  return tokens.join(' ').slice(0, NORMALIZED_NAME_MAX);
}
