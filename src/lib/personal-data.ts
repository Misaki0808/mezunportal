/** SSS, profil ve işlem kaydı için ortak biçim denetimi; kişisel veriyi günlüğe yazmaz. */
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Türkiye cep telefonu (0 / +90 / 90 önekli ya da öneksiz, ayraçlı ya da bitişik) ve 11 haneli kimlik numarası.
const PHONE_PATTERN = /(?:\+?90|0)?[\s.-]?\(?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/;
const NATIONAL_ID_PATTERN = /(?<!\d)\d{11}(?!\d)/;

export function looksLikePersonalData(text: string): boolean {
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || NATIONAL_ID_PATTERN.test(text);
}

export { looksLikePersonalData as hasPersonalDataPattern };

// Kimlik alanı (kart 435; işlem kaydı için kart 403/#194'te doğdu): yalnız TAM UUID (RFC varyantı) ya da seed kimliğinin 24 hex
// biçimi. Serbest metin bu istisnaya girmez; kimlik anahtarı tek başına telefon/e-postayı aklamaz. UUID'nin son grubu rastgele
// rakam ağırlıklı olabildiği için (`…-005551234567`) telefon desenine benzeyebilir; bu yanlış pozitif tarama dışı bırakılır.
const IDENTIFIER_VALUE =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{24})$/i;

/** Alan adı bir kimlik alanı mı (`id`, `ids`, `…Id`, `…Ids`, `…_id`, `…_ids`)? */
export function isIdentifierKey(key: string): boolean {
  return key === 'id' || key === 'ids' || /(?:Id|Ids|_id|_ids)$/.test(key);
}

/**
 * Alan, sunucunun ürettiği bir kimlik mi: anahtar kimlik anahtarı VE değerin tamamı UUID/24 hex. İkisi birden gerekir; kişisel
 * veri taramasından yalnız böyle alanlar muaftır. Yazım, okuma ve onay yolları aynı kuralı buradan alır (kopya yok).
 */
export function isIdentifierField(key: string, value: string): boolean {
  return isIdentifierKey(key) && IDENTIFIER_VALUE.test(value);
}

/**
 * Nesnenin dize alanlarından biri kişisel veri deseni taşıyor mu? Kimlik alanları (`isIdentifierField`) taranmaz, serbest metin
 * (telefon, e-posta, kimlik numarası) taranır. Sunucunun eklediği sözlük kimliklerini (`companyId`, `titleId`, `skillId`)
 * kullanıcı metni sanıp reddetmemek için nesne bütününü taramak yerine bunu kullan.
 */
export function hasPersonalDataInValues(values: object): boolean {
  return Object.entries(values).some(
    ([key, value]) =>
      typeof value === 'string' && !isIdentifierField(key, value) && looksLikePersonalData(value),
  );
}
