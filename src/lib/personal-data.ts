/** SSS, profil ve işlem kaydı için ortak biçim denetimi; kişisel veriyi günlüğe yazmaz. */
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Türkiye cep telefonu (0 / +90 / 90 önekli ya da öneksiz, ayraçlı ya da bitişik) ve 11 haneli kimlik numarası.
const PHONE_PATTERN = /(?:\+?90|0)?[\s.-]?\(?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/;
const NATIONAL_ID_PATTERN = /(?<!\d)\d{11}(?!\d)/;

export function looksLikePersonalData(text: string): boolean {
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || NATIONAL_ID_PATTERN.test(text);
}

export { looksLikePersonalData as hasPersonalDataPattern };
