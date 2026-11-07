/**
 * Kodlu hata yardımcıları. Kullanıcıya dönen her hata kararlı bir `errorCode` taşır; ham
 * `err.message` ekrana basılmaz. Her kod burada kayıtlıdır ve `messages/tr.json` `errors.codes`
 * altında metni vardır (bekçi testi: `errors.test.ts`, `pnpm messages:check`).
 *
 * Yeni kod: önce `ERROR_CODES`'a ekle, sonra `messages/tr.json`'a metnini yaz.
 * Dinamik değer `params`'a girer; kişisel veri ve sır girmez.
 */

export const ERROR_CODES = [
  'VALIDATION_INVALID',
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'RESOURCE_NOT_FOUND',
  'RESOURCE_CONFLICT',
  'RATE_LIMITED',
  'SERVER_UNEXPECTED',
  'DB_UNAVAILABLE',
  'AUDIT_REASON_REQUIRED',
  'AUDIT_REASON_INVALID',
  'MEMBERSHIP_TRANSITION_INVALID',
  'AUTH_LINK_INVALID',
  'AUTH_PROVIDER_NOT_CONFIGURED',
  'AUTH_PROVIDER_FAILED',
  'AUTH_TEST_LOGIN_DISABLED',
  'EMAIL_DOMAIN_NOT_ALLOWED',
  'MEMBERSHIP_ALREADY_VERIFIED',
  'DOCUMENT_REQUIRED',
  'DOCUMENT_EMPTY',
  'DOCUMENT_TOO_LARGE',
  'DOCUMENT_NOT_PDF',
  'DOCUMENT_ALREADY_PENDING',
  'DOCUMENT_NOT_PENDING',
  'CONSENT_REQUIRED',
  'CONSENT_VERSION_OUTDATED',
  'CONTACT_REQUEST_SELF',
  'CONTACT_REQUEST_ALREADY_OPEN',
  'CONTACT_REQUEST_NOT_PENDING',
  'CONTACT_REQUEST_NOT_APPROVED',
  'CONTACT_FIELD_NOT_REQUESTABLE',
  'ACCOUNT_DELETE_CONFIRMATION_MISMATCH',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorKind =
  'validation' | 'unauthenticated' | 'forbidden' | 'notFound' | 'conflict' | 'rateLimited';

export type ErrorParams = Readonly<Record<string, string | number | boolean>>;

const STATUS_BY_KIND: Readonly<Record<ErrorKind, number>> = {
  validation: 422,
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  rateLimited: 429,
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

export class CodedError extends Error {
  readonly kind: ErrorKind;
  readonly code: ErrorCode;
  readonly params: ErrorParams;
  readonly status: number;

  constructor(kind: ErrorKind, code: ErrorCode, params: ErrorParams = {}) {
    // Kayıtsız kod tip sistemini aşsa bile (örn. any) çalışma anında yakalanır.
    if (!isErrorCode(code)) {
      throw new TypeError(`Kayıtsız hata kodu: ${String(code)}`);
    }
    // `message` yalnız kodu taşır; kullanıcı metni `errors.codes` kataloğundan gelir.
    super(code);
    this.name = 'CodedError';
    this.kind = kind;
    this.code = code;
    this.params = params;
    this.status = STATUS_BY_KIND[kind];
  }
}

export function codedValidation(code: ErrorCode, params?: ErrorParams): CodedError {
  return new CodedError('validation', code, params);
}

export function codedUnauthenticated(code: ErrorCode, params?: ErrorParams): CodedError {
  return new CodedError('unauthenticated', code, params);
}

export function codedForbidden(code: ErrorCode, params?: ErrorParams): CodedError {
  return new CodedError('forbidden', code, params);
}

export function codedNotFound(code: ErrorCode, params?: ErrorParams): CodedError {
  return new CodedError('notFound', code, params);
}

export function codedConflict(code: ErrorCode, params?: ErrorParams): CodedError {
  return new CodedError('conflict', code, params);
}

export function codedRateLimited(code: ErrorCode, params?: ErrorParams): CodedError {
  return new CodedError('rateLimited', code, params);
}

export function isCodedError(value: unknown): value is CodedError {
  return value instanceof CodedError;
}
