import { randomInt } from 'node:crypto';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Kişisel veri süzgecine girebilecek metinlerde (profil/CV/SSS alanları, işlem kaydı değerleri; `src/lib/personal-data.ts`)
 * kullanılacak benzersiz test işaretçisi: ön ek + yalnız küçük harf. Rakam içermediği için hiçbir uzunlukta telefon ya da
 * 11 haneli kimlik numarası biçimine benzemez.
 *
 * Neden `randomUUID().slice(0, 12)` değil: onaltılık karakterler ~%62 rakamdır; 12 karakter ara sıra 10–11 haneli bir rakam
 * dizisi olur (`PROFILE_TEXT_PERSONAL_DATA`, ~%0,4) ve test aynı kodla rastgele kırmızıya düşer. 10 harf ≈ 47 bit: çakışma
 * olasılığı testler için ihmal edilebilir.
 */
export function letterMarker(prefix = '', length = 10): string {
  let value = prefix;
  for (let index = 0; index < length; index += 1) value += LETTERS[randomInt(LETTERS.length)];
  return value;
}
