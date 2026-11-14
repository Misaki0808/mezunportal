import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

/**
 * Hesap adı (ad soyad) sözleşmesi (kart 353). Ad, `User.name` alanıdır: ilk girişte e-postanın yerel kısmından türetilir
 * (`nameFromEmail`), kullanıcı `/baslangic` ve `/hesap/ad-soyad` ekranından düzeltir. Kurallar sunucuda uygulanır; istemci
 * yalnız aynı şemayı kullanarak anında geri bildirim verir.
 *
 * - Kimlik oturumdandır: girdide kullanıcı kimliği YOKTUR (şema `strict`), başkasının adı değiştirilemez.
 * - Her değişiklik işlem kaydına `USER_NAME_CHANGE` olarak yazılır; eski ve yeni ad kayda GİRMEZ, yalnız "ad değişti".
 * - Aynı ad yeniden gönderilirse işlem yapılmaz ve kayıt yazılmaz.
 */
const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;
const NAME_INVALID = 'ACCOUNT_NAME_INVALID' satisfies ErrorCode;

export const ACCOUNT_NAME_LIMITS = { min: 2, max: 80 } as const;

/**
 * Harf (Türkçe dahil) sözcükleri; aralarında tek boşluk, kesme işareti ya da tire. Rakam, nokta, `@` ve başka simge yoktur
 * (e-postadan türeyen "ayse yilmaz1989" ya da "r1" bu yüzden düzeltilmeden kaydedilemez).
 */
export const ACCOUNT_NAME_PATTERN = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;

/** Kırpar, ardışık boşlukları teke indirir, Unicode'u birleşik biçime (NFC) çevirir. */
export function normalizeAccountName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function isValidAccountName(name: string): boolean {
  const length = [...name].length;
  return (
    length >= ACCOUNT_NAME_LIMITS.min &&
    length <= ACCOUNT_NAME_LIMITS.max &&
    ACCOUNT_NAME_PATTERN.test(name)
  );
}

export const updateMyNameSchema = z
  .object({
    name: z
      .string({ error: INVALID })
      .transform(normalizeAccountName)
      .refine(isValidAccountName, { error: NAME_INVALID }),
  })
  .strict();
export type UpdateMyNameInput = z.input<typeof updateMyNameSchema>;

export const myAccountNameSchema = z.object({ name: z.string() });
export type MyAccountName = z.infer<typeof myAccountNameSchema>;
export const updateMyNameOutputSchema = z.object({ name: z.string(), changed: z.boolean() });
export type UpdateMyNameOutput = z.infer<typeof updateMyNameOutputSchema>;

export const ACCOUNT_NAME_ACTION_ERRORS = {
  getMyAccountName: ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'],
  updateMyName: [
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'VALIDATION_INVALID',
    'RATE_LIMITED',
  ],
} as const satisfies Record<string, readonly ErrorCode[]>;
