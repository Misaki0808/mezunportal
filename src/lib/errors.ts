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
  'AUTH_IP_RATE_LIMITED',
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
  'EMAIL_CHANGE_SAME_ADDRESS',
  'ACCOUNT_NAME_INVALID',
  'CV_PDF_UNREADABLE',
  'CV_TOO_MANY_PAGES',
  'CV_PROVIDER_NOT_CONFIGURED',
  'CV_LINKEDIN_UNAVAILABLE',
  'CV_TRANSFER_CONSENT_REQUIRED',
  'CV_DAILY_LIMIT_REACHED',
  'CV_ALREADY_PROCESSING',
  'CV_NOT_READY',
  'CV_REVIEW_STALE',
  'CV_CONFLICT_UNRESOLVED',
  'CV_PARSE_UNAVAILABLE',
  'CV_PARSE_TIMEOUT',
  'CV_PARSE_INVALID_OUTPUT',
  'CV_PARSE_EMPTY',
  'PROFILE_TAG_INVALID',
  'MENTOR_NOT_ELIGIBLE',
  'EXPERIENCE_NOT_EDITABLE',
  'EXPERIENCE_INCOMPLETE',
  'EXPERIENCE_NOT_DRAFT',
  'EXPERIENCE_NOT_PENDING',
  'EXPERIENCE_NOT_PUBLISHED',
  'REPORT_ALREADY_OPEN',
  'REPORT_NOT_OPEN',
  'ONBOARDING_REQUIRED_STEP_PENDING',
  'ADMIN_SELF_ACTION',
  'ADMIN_TARGET_PRIVILEGED',
  'USER_ALREADY_SUSPENDED',
  'USER_NOT_SUSPENDED',
  'MEMBERSHIP_CORRECTION_INVALID',
  'ADMIN_GRANT_EXISTS',
  'ADMIN_GRANT_NOT_ACTIVE',
  'ADMIN_LAST_SYSTEM_GRANT',
  'DICTIONARY_ENTRY_EXISTS',
  'UNMATCHED_NOT_OPEN',
  'PROFILE_LINK_INVALID',
  'PROFILE_LINK_NOT_HTTPS',
  'PROFILE_LINK_HOST_NOT_ALLOWED',
  'PROFILE_LIMIT_REACHED',
  'APPOINTMENT_SLOT_INVALID',
  'APPOINTMENT_SLOT_TAKEN',
  'APPOINTMENT_MENTOR_UNAVAILABLE',
  'APPOINTMENT_OPEN_REQUEST_EXISTS',
  'APPOINTMENT_CAPACITY_FULL',
  'CAMPUS_EVENT_CAPACITY_FULL',
  'APPOINTMENT_NOT_REQUESTED',
  'APPOINTMENT_EXPIRED',
  'APPOINTMENT_NOT_CANCELLABLE',
  'APPOINTMENT_LINK_NOT_NEEDED',
  'APPOINTMENT_LINK_INVALID',
  'MENTOR_SETTINGS_INVALID',
  'FEEDBACK_NOT_READY',
  'FEEDBACK_ALREADY_SUBMITTED',
  'CV_REVIEW_UNAVAILABLE',
  'CV_REVIEW_MONTHLY_LIMIT',
  'CV_REVIEW_NO_CV',
  'CV_REVIEW_OPEN_EXISTS',
  'CV_REVIEW_CLOSED',
  'CV_REVIEW_ALREADY_HELPFUL',
  'POINT_ALREADY_REVOKED',
  'SUSPICION_ALREADY_DECIDED',
  'POINT_BACKFILL_UNAVAILABLE',
  'FAQ_SIMILAR_EXISTS',
  'FAQ_TEXT_PERSONAL_DATA',
  'FAQ_REQUEST_CLOSED',
  'FAQ_OWN_REQUEST',
  'FAQ_IDENTITY_LEAK',
  'JOB_POSTING_NOT_EDITABLE',
  'JOB_POSTING_NOT_DRAFT',
  'JOB_POSTING_INCOMPLETE',
  'JOB_POSTING_NOT_PENDING',
  'REFERRAL_NOT_ELIGIBLE',
  'REFERRAL_INVALID_STATE',
  'AWARD_FREEZE_MISSED',
  'STORY_IDENTITY_LEAK',
  'STORY_INVALID_STATE',
  'STORY_MONTH_ALREADY_SELECTED',
  'REFERRAL_CANCEL_WINDOW_CLOSED',
  'JOB_POSTING_NOT_OPEN',
  'JOB_POSTING_URL_INVALID',
  'JOB_POSTING_DEADLINE_INVALID',
  'JOB_POSTING_TARGET_INVALID',
  'FAQ_IDENTITY_WARNING',
  'SEEKER_CONSENT_REQUIRED',
  'SEEKER_TERM_INVALID',
  'SEEKER_HIRING_DECLARATION_REQUIRED',
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
