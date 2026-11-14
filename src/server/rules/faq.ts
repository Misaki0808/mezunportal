import { looksLikePersonalData } from '@/lib/personal-data';

/**
 * SSS gizlilik kuralları (saf). Yayında hiçbir isim/kimlik olmamalıdır: yayın metni, talebe dahil herkesin
 * (soran, cevap yazanlar) adını/soyadını ve e-posta/telefon/kimlik numarası biçimini içeremez. Denetim bilinçli olarak
 * katıdır (sızıntı geri alınamaz); kesmesiz ekli biçim ve ad önekiyle eşleşen sözcük engel değil uyarıdır (moderatör onayı + işlem kaydı).
 */

/**
 * Kesme işareti gibi kullanılan ama HARF sayılan (Unicode `Lm`) ya da simge sınıfındaki karakterler: ʹ ʺ ʻ ʼ ʽ ʾ ʿ ˈ ՚ ꞌ.
 * `\p{L}` bunları sözcüğün parçası sayar ("Denizʼin" tek sözcük olurdu ve tam ad eşleşmesi yerine önek UYARISI verirdi);
 * ayırıcı olarak boşluğa çevrilir, böylece düz/kıvrık kesme ile aynı sonucu (tam eşleşme = engel) verir.
 */
const APOSTROPHE_LIKE = /[\u02B9-\u02BF\u02C8\u0374\u055A\uA78B\uA78C]/gu;

/** Karşılaştırma ve gösterim için ortak ön işlem: NFKC, biçim (görünmez) karakterleri at, kesme benzerlerini ayırıcı yap. */
function prepare(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(APOSTROPHE_LIKE, ' ');
}

/**
 * Türkçe katlama: İ→i, I→ı, aksanlar ve birleştirici işaretler düşer (Déniz/Dêniz = deniz); karşılaştırma büyük/küçük
 * harf ve aksandan bağımsızdır.
 */
export function foldTr(value: string): string {
  return prepare(value)
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i');
}

const WORD = /[\p{L}\p{N}]+/gu;
/** 3 harfli ad sözcükleri yalnız tam eşleşmeyle; ek ve önek eşleşmesi 4+ harfli adlar içindir. */
const MIN_NAME_TOKEN = 3;
const SUFFIX_MIN_LENGTH = 4;
/** Uyarıda gösterilen en çok sözcük ve sözcük başına en çok karakter. */
const WARNING_LIMIT = 5;
const WARNING_WORD_MAX = 40;

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
/**
 * Katlanmış sözcüğün ad sözcüğüyle ilişkisi: tam sözcük (engel), ad ile BAŞLAYAN başka sözcük (uyarı), ilgisiz.
 * Türkçe yazım kuralı: özel isim ek alınca kesme alır ("Deniz'in" → sözcüklere "deniz" + "in" bölünür = tam eşleşme, ENGEL);
 * kesmesiz ekli biçim ("denize", "sisteme", "Ahmete") çoğunlukla cins isimdir → UYARI (moderatör onayı + işlem kaydı).
 */
function matchWord(word: string, token: string): WordMatch {
  if (word === token) return 'exact';
  if (token.length < SUFFIX_MIN_LENGTH || !word.startsWith(token)) return 'none';
  return 'prefix';
}

function addWarning(warnings: string[], word: string): void {
  const shown = word.length > WARNING_WORD_MAX ? `${word.slice(0, WARNING_WORD_MAX)}…` : word;
  if (warnings.length < WARNING_LIMIT && !warnings.includes(shown)) warnings.push(shown);
}

/**
 * Metni verilen adlara, kimliklere ve e-posta/telefon/kimlik numarası biçimine göre inceler. **Engel:** adın tam sözcüğü
 * (kesmeli ekli biçim "Deniz'in" dahil), harfleri boşluk/noktalamayla bölünmüş ad, kişisel veri biçimi, kullanıcı/kayıt
 * kimliği. **Uyarı:** ad ile başlayan başka sözcük: kesmesiz ekli biçim ("denize", "Ahmete") ve önek eşleşmesi ("denizcilik").
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
  const display = (prepare(text).match(WORD) ?? []).map((word) => ({
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
      if (tail === '') return { blocked: true, warnings: [] };
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
