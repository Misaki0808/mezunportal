/** CV metnindeki açık kişisel veri kalıplarını yerel ve yan etkisiz biçimde gizler. */
const marker = {
  name: '[AD]',
  email: '[E-POSTA]',
  phone: '[TELEFON]',
  url: '[BAĞLANTI]',
  identity: '[KİMLİK]',
  iban: '[IBAN]',
  birth: '[DOĞUM TARİHİ]',
  person: '[KİŞİ]',
  address: '[ADRES]',
} as const;

const normalizeText = (value: string) =>
  value
    .normalize('NFC')
    .replace(/i\u0307/gu, 'i')
    .replace(/[\u200B-\u200D\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu, '');

export function isTurkishIdentityNumber(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  return (
    (((odd * 7 - even) % 10) + 10) % 10 === d[9] &&
    d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10]
  );
}

function isIban(value: string): boolean {
  const rotated = value.slice(4) + value.slice(0, 4);
  let remainder = 0;
  for (const char of rotated) {
    const digits = /\d/u.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** PDF ASCII/İ-ı varyantları ve harf arası noktalar; sınırlar başka sözcüklerin parçalarını eşlemez. */
function namePattern(part: string): RegExp {
  const pattern = [...part.normalize('NFC')]
    .map((char) => {
      const folded = char.toLocaleLowerCase('tr-TR');
      const aliases: Record<string, string> = {
        i: 'iİIı',
        ı: 'iİIı',
        s: 'sSşŞ',
        ş: 'sSşŞ',
        g: 'gGğĞ',
        ğ: 'gGğĞ',
        c: 'cCçÇ',
        ç: 'cCçÇ',
        u: 'uUüÜ',
        ü: 'uUüÜ',
        o: 'oOöÖ',
        ö: 'oOöÖ',
      };
      if (aliases[folded]) return `[${aliases[folded]}]`;
      const lower = folded;
      const upper = char.toLocaleUpperCase('tr-TR');
      if (lower.length === 1 && upper.length === 1 && lower !== upper) return `[${lower}${upper}]`;
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('[.\\s]*');
  return new RegExp(`(?<![\\p{L}\\p{M}])${pattern}(?![\\p{L}\\p{M}])`, 'gu');
}

function redactReferencedPeople(text: string): string {
  const heading =
    /^(\s*(?:referans(?:lar)?|references?|yönetici|danışman|supervisor|iletişim kişisi)\s*)(?::\s*|$)/u;
  const person =
    /(?<![\p{L}])(?:(?:Prof|Dr|Doç|Mr|Mrs|Ms)\.\s*)*(?:[\p{Lu}][\p{Ll}]+|[\p{Lu}]{2,})(?:\s+(?:[\p{Lu}][\p{Ll}]+|[\p{Lu}]{2,})){1,2}(?![\p{L}])/gu;
  let inBlock = false;
  return text
    .split('\n')
    .map((line) => {
      const match = line.toLocaleLowerCase('tr-TR').match(heading);
      if (match) {
        inBlock = true;
        return (
          line.slice(0, match[0].length) +
          line.slice(match[0].length).replace(person, marker.person)
        );
      }
      if (!inBlock) return line;
      if (!line.trim() || /^\s*[\p{L} ]+\s*:/u.test(line)) {
        inBlock = false;
        return line;
      }
      const masked = line.replace(person, marker.person);
      if (masked === line && !/\[(?:E-POSTA|TELEFON)\]/u.test(line)) inBlock = false;
      return masked;
    })
    .join('\n');
}

function foldDomain(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Ad yalnız sunucudan gelir; eksikse çağıran sağlayıcıyı çalıştırmamalıdır. */
export function redactCvText(text: string, ownerName: string): string {
  if (text.length > 200_000 || ownerName.length > 256) throw new Error('CV_REDACTION_LIMIT');
  const parts = normalizeText(ownerName)
    .trim()
    .split(/[\s-]+/u)
    .filter(Boolean);
  if (!parts.length || parts.length > 20) throw new Error('CV_OWNER_NAME_REQUIRED');
  let result = normalizeText(text);
  // Önce uzun, tekil kalıplar: telefonları veya URL'leri parçalamadan gizle.
  // PDF satır kırıkları ve yaygın at/dot yazımları yalnız e-posta eşleşmesinde birleştirilir.
  // Metnin geri kalanındaki boşluklar ve okul/iş/beceri adları değiştirilmez.
  const emailDot = String.raw`(?:[.．]|\[\s*dot\s*\]|\(\s*dot\s*\))`;
  const emailAt = String.raw`(?:[@＠]|\[\s*at\s*\]|\(\s*at\s*\))`;
  const emailLocal = String.raw`[\p{L}\p{N}_%+-]+(?:\s*\.\s*[\p{L}\p{N}_%+-]+)*`;
  const emailDomain = String.raw`(?:[\p{L}\p{N}-]+\s*${emailDot}\s*)+[\p{L}]{2,}`;
  result = result.replace(
    new RegExp(
      String.raw`(?<![\p{L}\p{N}._%+-])${emailLocal}\s*${emailAt}\s*${emailDomain}(?![\p{L}\p{N}_-])`,
      'giu',
    ),
    marker.email,
  );
  for (const [country, length] of Object.entries({
    TR: 26,
    GB: 22,
    DE: 22,
    FR: 27,
    NL: 18,
    ES: 24,
    IT: 27,
    BE: 16,
    CH: 21,
  })) {
    const iban = new RegExp(
      `(?<![\\p{L}\\p{N}])${country}[\\s-]*\\d[\\s-]*\\d(?:[\\s-]*[A-Z0-9]){${length - 4}}(?![\\p{L}\\p{N}])`,
      'giu',
    );
    result = result.replace(iban, marker.iban);
  }
  // Diğer ülkeler: bütün ülke kodları için IBAN mod-97 doğrulaması; ayırıcı sonrası metin korunur.
  result = result.replace(
    /(?<![\p{L}\p{N}])[A-Z]{2}[\s-]*\d[\s-]*\d(?:[\s-]*[A-Z0-9]){11,30}/giu,
    (candidate) => {
      let compact = '';
      for (let index = 0; index < candidate.length; index += 1) {
        const char = candidate[index]!;
        if (!/[A-Z0-9]/iu.test(char)) continue;
        compact += char.toUpperCase();
        const next = candidate[index + 1];
        if (compact.length >= 15 && (!next || !/[A-Z0-9]/iu.test(next)) && isIban(compact))
          return marker.iban + candidate.slice(index + 1);
      }
      return candidate;
    },
  );
  // Geçersiz bir aday, ardından gelen gerçek kimlik numarasının başlangıcını tüketmez.
  // Önce tek satırlı tam adaylar; sonra PDF'de satıra bölünmüş adaylar değerlendirilir.
  for (const gap of [String.raw`(?:[^\S\r\n]|[./-])*`, String.raw`[\s./-]*`]) {
    const candidates = new RegExp(String.raw`(?<!\d)(?=(\d(?:${gap}\d){10}(?!\d)))`, 'gu');
    const pieces: string[] = [];
    let cursor = 0;
    for (const match of result.matchAll(candidates)) {
      const value = match[1]!;
      if (match.index < cursor || !isTurkishIdentityNumber(value.replace(/\D/g, ''))) continue;
      pieces.push(result.slice(cursor, match.index), marker.identity);
      cursor = match.index + value.length;
    }
    result = pieces.join('') + result.slice(cursor);
  }
  result = result.replace(
    /(?:https?:\/\/|www\.)[^\s<>]+|(?<![\p{L}\p{N}@])(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}\/[^\s<>]*/giu,
    marker.url,
  );
  const ownerParts = parts.map(foldDomain).filter((part) => part.length >= 3);
  result = result.replace(
    /(?<![\p{L}\p{N}@._-])(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?![\p{L}\p{N}_-])/gu,
    (domain) => {
      const labels = foldDomain(domain).split('.').slice(0, -1).join('');
      return ownerParts.some((part) => labels.includes(part)) ? '[URL]' : domain;
    },
  );
  result = result.replace(
    /\b(?:linkedin|github|instagram|twitter)\s*(?:kullanıcı\s*adı|username|hesabı)?\s*[:：]\s*@?[\p{L}\p{N}_.-]+/giu,
    marker.url,
  );
  result = result.replace(
    /(?<![\p{L}\p{N}_])@[\p{L}\p{N}_][\p{L}\p{N}_.-]{1,}(?![\p{L}\p{N}_])/gu,
    marker.url,
  );
  result = result.replace(
    /(?:doğum(?:\s*(?:tarihi|günü|yılı))?|d\s*\.\s*t\.|birth\s*(?:date|day)|date\s*of\s*birth|dob)\s*[:\-]?\s*(?:\d{1,4}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{1,2}\s+[\p{L}]+\s+\d{4}|\d{4})/giu,
    marker.birth,
  );
  result = result.replace(
    /(?:birth\s*(?:date|day)|date\s*of\s*birth|dob)\s*[:\-]?\s*[\p{L}]+\s+\d{1,2},?\s+\d{4}/giu,
    marker.birth,
  );
  result = result.replace(/(?<!\d)\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}(?!\d)/gu, marker.birth);
  result = result.replace(/(?<!\d)\d{4}[.\/-]\d{2}[.\/-]\d{2}(?!\d)/gu, marker.birth);
  // Önce tamamı aynı satırdaki numaralar: sonraki satırın eğitim yılı telefona eklenmez.
  // İkinci tur yalnız PDF'de satıra bölünmüş numaraları da kapsar.
  for (const gap of [String.raw`(?:[^\S\r\n]|[().-])*`, String.raw`[\s().-]*`]) {
    for (const body of [
      String.raw`(?:\+|00)${gap}\d(?:${gap}\d){9,14}`,
      String.raw`\(?1${gap}[2-9](?:${gap}\d){9}`,
      String.raw`\(?0?[2-5](?:${gap}\d){9}`,
    ]) {
      result = result.replace(
        new RegExp(String.raw`(?<![\p{L}\p{N}_])${body}\)?(?![\p{L}\p{N}_])`, 'gu'),
        marker.phone,
      );
    }
  }
  result = result.replace(
    /^(?!\s*referans\s+numarası\s*:\s*\d+\s*$).*(?:\b(?:mah(?:alle(?:si)?)?|cad(?:de(?:si)?)?|sok(?:ak|ağı)?)\.?(?=\s|,|:|$)|\b(?:no|posta\s*kodu|adres|address)\s*[.:]|\b\d{5}\b).*$/gimu,
    marker.address,
  );
  result = redactReferencedPeople(result);
  for (const part of [...new Set(parts)].sort((a, b) => b.length - a.length)) {
    result = result.replace(namePattern(part), marker.name);
  }
  return result;
}
