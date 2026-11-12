/** CV metnindeki açık kişisel veri kalıplarını yerel ve yan etkisiz biçimde gizler. */
const marker = {
  name: '[AD]',
  email: '[E-POSTA]',
  phone: '[TELEFON]',
  url: '[BAĞLANTI]',
  identity: '[KİMLİK]',
  iban: '[IBAN]',
  birth: '[DOĞUM TARİHİ]',
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

/** İ/ı ayrımı Türkçe harf kurallarıyla; harf sınırları diğer adların parçalarını eşlemez. */
function namePattern(part: string): RegExp {
  const pattern = [...part.normalize('NFC')]
    .map((char) => {
      const lower = char.toLocaleLowerCase('tr-TR');
      const upper = char.toLocaleUpperCase('tr-TR');
      if (lower.length === 1 && upper.length === 1 && lower !== upper) return `[${lower}${upper}]`;
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`(?<![\\p{L}\\p{M}])${pattern}(?![\\p{L}\\p{M}])`, 'gu');
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
  result = result.replace(
    /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}(?![\p{L}\p{N}_-])/gu,
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
      `(?<![\\p{L}\\p{N}])${country}[ \\t-]*\\d[ \\t-]*\\d(?:[ \\t-]*[A-Z0-9]){${length - 4}}(?![\\p{L}\\p{N}])`,
      'giu',
    );
    result = result.replace(iban, marker.iban);
  }
  // Diğer ülkeler: bütün ülke kodları için IBAN mod-97 doğrulaması; ayırıcı sonrası metin korunur.
  result = result.replace(
    /(?<![\p{L}\p{N}])[A-Z]{2}[ \t-]*\d[ \t-]*\d(?:[ \t-]*[A-Z0-9]){11,30}/giu,
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
  result = result.replace(/(?<!\d)\d(?:[ \t]?\d){10}(?!\d)/gu, (value) =>
    isTurkishIdentityNumber(value.replace(/[ \t]/g, '')) ? marker.identity : value,
  );
  result = result.replace(
    /(?:https?:\/\/|www\.)[^\s<>]+|(?<![\p{L}\p{N}@])(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}\/[^\s<>]*/giu,
    marker.url,
  );
  result = result.replace(
    /(?<![\p{L}\p{N}_])@[\p{L}\p{N}_][\p{L}\p{N}_.-]{1,}(?![\p{L}\p{N}_])/gu,
    marker.url,
  );
  result = result.replace(
    /(?:doğum\s*(?:tarihi|günü|yılı)|birth\s*(?:date|day)|date\s*of\s*birth|dob)\s*[:\-]?\s*(?:\d{1,4}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{1,2}\s+[\p{L}]+\s+\d{4}|\d{4})/giu,
    marker.birth,
  );
  result = result.replace(
    /(?:birth\s*(?:date|day)|date\s*of\s*birth|dob)\s*[:\-]?\s*[\p{L}]+\s+\d{1,2},?\s+\d{4}/giu,
    marker.birth,
  );
  result = result.replace(/(?<!\d)\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}(?!\d)/gu, marker.birth);
  result = result.replace(/(?<!\d)\d{4}[.\/-]\d{2}[.\/-]\d{2}(?!\d)/gu, marker.birth);
  result = result.replace(
    /(?<![\p{L}\p{N}])\+?\(?\d[\d \t().-]{7,}\d(?![\p{L}\p{N}])/gu,
    (value) => {
      const digits = value.replace(/\D/g, '');
      const valid =
        value.startsWith('+') || digits.startsWith('00')
          ? digits.length >= 10 && digits.length <= 15
          : /^0?[2-5]\d{9}$|^1[2-9]\d{9}$/.test(digits);
      return valid ? marker.phone : value;
    },
  );
  result = result.replace(
    /^.*(?:\b(?:mah(?:alle(?:si)?)?|cad(?:de(?:si)?)?|sok(?:ak|ağı)?)\.?(?=\s|,|:|$)|\b(?:no|posta\s*kodu|adres|address)\s*[.:]|\b\d{5}\b).*$/gimu,
    marker.address,
  );
  for (const part of [...new Set(parts)].sort((a, b) => b.length - a.length)) {
    result = result.replace(namePattern(part), marker.name);
  }
  return result;
}
