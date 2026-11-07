import type { ErrorCode, ErrorParams } from '@/lib/errors';

/**
 * Bütün sunucu eylemlerinin dönüş biçimi. Beklenen hatalar FIRLATILMAZ, değer olarak döner: Next.js
 * üretimde fırlatılan hata mesajlarını istemciden gizler ve ekranın `errorCode` → metin kataloğu
 * (`messages/tr.json` `errors.codes`) çevirisine ihtiyacı vardır. Ham `err.message` ekrana basılmaz.
 *
 * - `errorCode`: kararlı üst düzey kod (doğrulama hatasında `VALIDATION_INVALID`).
 * - `fieldErrors`: alan adı → kod; ekran hatayı ilgili alanın altında gösterir (örn. `file` →
 *   `DOCUMENT_TOO_LARGE`). Alan adı Zod şemasındaki anahtardır.
 * - `params`: kodun metnindeki dinamik değerler (kişisel veri ve sır içermez).
 */
export type FieldErrors = Readonly<Record<string, ErrorCode>>;

export type ActionFailure = {
  ok: false;
  errorCode: ErrorCode;
  params?: ErrorParams;
  fieldErrors?: FieldErrors;
};

export type ActionResult<T> = { ok: true; data: T } | ActionFailure;
