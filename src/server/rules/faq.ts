import { looksLikePersonalData } from './adminAudit';

/**
 * SSS gizlilik kuralları (saf). Yayında hiçbir isim/kimlik olmamalıdır: yayın metni, talebe dahil herkesin
 * (soran, cevap yazanlar) adını/soyadını ve e-posta/telefon/kimlik numarası biçimini içeremez. Denetim bilinçli olarak
 * katıdır (sızıntı geri alınamaz); yalnız ad ÖNEKİ eşleşmesi engel değil uyarıdır (moderatör onayı + işlem kaydı).
 */

/** Türkçe katlama: İ→i, I→ı, aksanlar düşer; karşılaştırma büyük/küçük harf ve aksandan bağımsızdır. */
export function foldTr(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[ıçğöşüâîû]/g, (char) => 'icgosuaiu'['ıçğöşüâîû'.indexOf(char)] ?? char);
}

const WORD = /[\p{L}\p{N}]+/gu;
/** 3 harfli ad sözcükleri yalnız tam eşleşmeyle; ek ve önek eşleşmesi 4+ harfli adlar içindir. */
const MIN_NAME_TOKEN = 3;
const SUFFIX_MIN_LENGTH = 4;
/** Uyarıda gösterilen en çok sözcük ve sözcük başına en çok karakter. */
const WARNING_LIMIT = 5;
const WARNING_WORD_MAX = 40;

/**
 * Adın ENGEL sayılan Türkçe ekli halleri (kesmesiz). Katlanmış yazımla (`foldTr`: ı→i, ü→u, ö→o) tutulur; kesmeli biçimler
 * ("Deniz'in") sözcük bölünmesiyle zaten tam eşleşmedir. Liste dışı her ad-öneki eşleşmesi ("denizcilik") ENGEL DEĞİL,
 * UYARIDIR (moderatör onayıyla yayınlanır). Tablo veridir: bir ek uyarıya inecekse buradan çıkarılır.
 */
export const BLOCKING_NAME_SUFFIXES: readonly string[] = [
  // tamlayan (-in/-ın/-un/-ün, ünlü sonrası -nin/-nın/-nun/-nün)
  'in',
  'un',
  'nin',
  'nun',
  // yönelme (-e/-a, ünlü sonrası -ye/-ya)
  'e',
  'a',
  'ye',
  'ya',
  // belirtme (-i/-ı/-u/-ü, ünlü sonrası -yi/-yı/-yu/-yü)
  'i',
  'u',
  'yi',
  'yu',
  // bulunma (-de/-da/-te/-ta)
  'de',
  'da',
  'te',
  'ta',
  // çıkma (-den/-dan/-ten/-tan)
  'den',
  'dan',
  'ten',
  'tan',
  // vasıta (-le/-la, ünlü sonrası -yle/-yla)
  'le',
  'la',
  'yle',
  'yla',
  // iyelik (-im/-um, -imiz/-umuz, -iniz/-unuz)
  'im',
  'um',
  'imiz',
  'umuz',
  'iniz',
  'unuz',
  // çoğul ve çoğul + durum eki
  'ler',
  'lar',
  'leri',
  'lari',
  'lerin',
  'larin',
  'lere',
  'lara',
  'lerde',
  'larda',
  'lerden',
  'lardan',
];

export function nameTokens(names: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const name of names)
    for (const token of foldTr(name).match(WORD) ?? [])
      if (token.length >= MIN_NAME_TOKEN) tokens.add(token);
  return [...tokens];
}

export type IdentityFinding = {
  /** Yayını durduran bulgu: kişisel veri biçimi, kimlik, adın tam/ekli hali ya da harfleri bölünmüş adı. */
  blocked: boolean;
  /** Yalnız ad ÖNEKİ eşleşen sözcükler (en çok 5): engel değil, moderatör onayıyla yayınlanır. */
  warnings: string[];
};

type WordMatch = 'exact' | 'prefix' | 'none';
/** Katlanmış sözcüğün ad sözcüğüyle ilişkisi: tam/ekli (engel), önek (uyarı), ilgisiz. */
function matchWord(word: string, token: string): WordMatch {
  if (word === token) return 'exact';
  if (token.length < SUFFIX_MIN_LENGTH || !word.startsWith(token)) return 'none';
  return BLOCKING_NAME_SUFFIXES.includes(word.slice(token.length)) ? 'exact' : 'prefix';
}

function addWarning(warnings: string[], word: string): void {
  const shown = word.length > WARNING_WORD_MAX ? `${word.slice(0, WARNING_WORD_MAX)}…` : word;
  if (warnings.length < WARNING_LIMIT && !warnings.includes(shown)) warnings.push(shown);
}

/**
 * Metni verilen adlara, kimliklere ve e-posta/telefon/kimlik numarası biçimine göre inceler. **Engel:** adın tam sözcüğü
 * ("Deniz", kesmeli "Deniz'in" dahil), `BLOCKING_NAME_SUFFIXES` ekli hali ("Denizin"), harfleri boşluk/noktalamayla bölünmüş
 * ad, kişisel veri biçimi, kullanıcı/kayıt kimliği. **Uyarı:** yalnız ad önekiyle başlayan başka sözcük ("denizcilik").
 */
export function analyzeIdentity(
  text: string,
  names: readonly string[],
  identifiers: readonly string[] = [],
): IdentityFinding {
  const normalized = foldTr(text);
  if (looksLikePersonalData(normalized)) return { blocked: true, warnings: [] };
  if (identifiers.some((id) => id.length > 0 && normalized.includes(foldTr(id))))
    return { blocked: true, warnings: [] };

  // Gösterim için özgün yazımlı sözcükler (katlama yalnız karşılaştırmada); noktalama atılmış biçim ayrıca, bölünmüş adı yakalar.
  const display = (
    text
      .normalize('NFKC')
      .replace(/\p{Cf}/gu, '')
      .match(WORD) ?? []
  ).map((word) => ({
    word,
    folded: foldTr(word),
  }));
  const seen = new Set(display.map((entry) => entry.folded));
  const joined = (normalized.replace(/[\p{P}\p{S}]+/gu, '').match(WORD) ?? [])
    .filter((word) => !seen.has(word))
    .map((word) => ({ word, folded: word }));
  const warnings: string[] = [];
  for (const token of nameTokens(names)) {
    for (const { word, folded } of [...display, ...joined]) {
      const match = matchWord(folded, token);
      if (match === 'exact') return { blocked: true, warnings: [] };
      if (match === 'prefix') addWarning(warnings, word);
    }
    if (token.length < SUFFIX_MIN_LENGTH) continue;
    // Harfler arasına boşluk veya noktalama konarak adın bölünmesi: ayırıcı içeren eşleşme + ek/son = engel, başka sözcüğe uzanıyorsa uyarı.
    const spaced = [...token].join('[\\s\\p{P}\\p{S}]*');
    const split = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${spaced})([\\p{L}\\p{N}]*)`, 'gu');
    for (const found of normalized.matchAll(split)) {
      const [, hit = '', tail = ''] = found;
      if (hit === token) continue; // ayırıcısız: yukarıdaki sözcük denetimi karar verdi
      if (tail === '' || BLOCKING_NAME_SUFFIXES.includes(tail))
        return { blocked: true, warnings: [] };
      addWarning(warnings, `${hit}${tail}`);
    }
  }
  return { blocked: false, warnings };
}

/**
 * Metin, verilen adlardan birini ("Ahmet", "Ahmet'e", "ahmete") ya da e-posta/telefon/kimlik numarası biçimini içeriyorsa
 * `true` (engel). Yalnız ad önekiyle eşleşen sözcükler engel DEĞİLDİR; `analyzeIdentity` bunları uyarı olarak verir.
 */
export function findIdentityLeak(
  text: string,
  names: readonly string[],
  identifiers: readonly string[] = [],
): boolean {
  return analyzeIdentity(text, names, identifiers).blocked;
}

/** Talep/cevap metninde yayına girmeden önce reddedilen kişisel veri biçimleri (e-posta, telefon, kimlik numarası). */
export function hasPersonalDataPattern(text: string): boolean {
  return looksLikePersonalData(text);
}
