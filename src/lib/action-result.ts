import { z } from 'zod';

import type { ActionFailure, ActionResult, FieldErrors } from '@/contracts/result';
import { isCodedError, isErrorCode, type ErrorCode } from '@/lib/errors';

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * Zod şemalarında hata mesajı bir `ErrorCode`'dur (`{ error: 'DOCUMENT_TOO_LARGE' }`); kayıtlı değilse
 * `VALIDATION_INVALID`. Böylece ekran, alanın altında kararlı koda karşılık gelen Türkçe metni gösterir.
 */
export function failureFromZod(error: z.ZodError): ActionFailure {
  const fieldErrors: Record<string, ErrorCode> = {};
  for (const issue of error.issues) {
    const field = issue.path.map(String).join('.');
    if (field === '' || field in fieldErrors) continue;
    fieldErrors[field] = isErrorCode(issue.message) ? issue.message : 'VALIDATION_INVALID';
  }
  const hasFields = Object.keys(fieldErrors).length > 0;
  return {
    ok: false,
    errorCode: 'VALIDATION_INVALID',
    ...(hasFields ? { fieldErrors: fieldErrors as FieldErrors } : {}),
  };
}

/** Beklenmeyen hatalar `SERVER_UNEXPECTED` olur; hata metni, yığın izi ve değerler dışarı sızmaz. */
export function actionFailure(error: unknown): ActionFailure {
  if (isCodedError(error)) {
    return {
      ok: false,
      errorCode: error.code,
      ...(Object.keys(error.params).length > 0 ? { params: error.params } : {}),
    };
  }
  if (error instanceof z.ZodError) return failureFromZod(error);
  return { ok: false, errorCode: 'SERVER_UNEXPECTED' };
}

/** Şemayla ayrıştırır: başarıda değeri, başarısızlıkta hazır `ActionFailure`'ı verir. */
export function parseInput<S extends z.ZodType>(
  schema: S,
  input: unknown,
): { ok: true; data: z.output<S> } | { ok: false; failure: ActionFailure } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, failure: failureFromZod(result.error) };
}
