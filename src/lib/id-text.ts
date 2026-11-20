import { z } from 'zod';

/** Kimlik metni üst sınırı (uuid ve slug'lar için yeterli). */
export const ID_TEXT_MAX_LENGTH = 64;

/** Denetim karakterleri (NUL, satır sonu, kaçış…) kimlikte hiçbir zaman geçerli değildir. */
export const hasControlCharacter = (value: string) => /\p{Cc}/u.test(value);

/**
 * İstemciden gelen kimlik/anahtar metni: kırp, 1–64 karakter, denetim karakteri yok. Kimlikteki NUL (`%00`) veritabanına
 * gidince "geçersiz bayt dizisi" hatasıyla beklenmeyen hata (500) üretirdi; burada kararlı `VALIDATION_INVALID` olur.
 */
export function idTextSchema(error = 'VALIDATION_INVALID', max = ID_TEXT_MAX_LENGTH) {
  return z
    .string({ error })
    .trim()
    .min(1, { error })
    .max(max, { error })
    .refine((value) => !hasControlCharacter(value), { error });
}
