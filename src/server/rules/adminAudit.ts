/**
 * Yönetici işlem kaydı politikası (D6, `docs/security.md` “Yönetici işlem kaydı”): hangi eylemler
 * kaydedilir, hangisi gerekçe ister ve kayıt KİŞİSEL VERİ taşımaz (yalnız kimlikler). Saf işlevler;
 * `services/audit.ts` (`recordAdminAction`) bunları uygular.
 *
 * Yeni yönetici eylemi: önce `ADMIN_ACTIONS`'a ekle (gerekçe zorunlu mu?), sonra eylemi yazan adım
 * `recordAdminAction` çağırır. Hedef türü için `AUDIT_TARGET_TYPES`.
 */

export const ADMIN_ACTIONS = {
  /** Mezun belgesi onayı. */
  DOCUMENT_APPROVE: { reasonRequired: false },
  /** Mezun belgesi reddi. */
  DOCUMENT_REJECT: { reasonRequired: true },
  /** Rol / bölüm düzeltme. */
  ROLE_CORRECT: { reasonRequired: true },
  /** Rol geçişi (öğrenci → mezun). */
  ROLE_TRANSITION: { reasonRequired: false },
  USER_SUSPEND: { reasonRequired: true },
  USER_UNSUSPEND: { reasonRequired: true },
  MODERATION_PUBLISH: { reasonRequired: false },
  MODERATION_REJECT: { reasonRequired: true },
  REPORT_RESOLVE: { reasonRequired: true },
  POINTS_REVOKE: { reasonRequired: true },
  /** Puan kuralı (değer, gecikme, etkinlik) değişikliği (sistem yöneticisi). */
  POINT_RULE_CHANGE: { reasonRequired: true },
  /** Geriye dönük puan hesaplamasını başlatma (sistem yöneticisi). */
  POINTS_BACKFILL: { reasonRequired: false },
  SUSPICION_DECIDE: { reasonRequired: true },
  ADMIN_GRANT: { reasonRequired: false },
  ADMIN_REVOKE: { reasonRequired: true },
  DATA_EXPORT: { reasonRequired: false },
  /** Sözlük kaydı oluşturma/güncelleme/silme (sistem yöneticisi). */
  DICTIONARY_CHANGE: { reasonRequired: false },
  /** Eşleşmeyen CV değerinin çözümü (bağla/yeni kayıt/at). */
  UNMATCHED_RESOLVE: { reasonRequired: false },
} as const;

export type AdminActionName = keyof typeof ADMIN_ACTIONS;

export const AUDIT_TARGET_TYPES = [
  'USER',
  'MEMBERSHIP',
  'GRADUATION_DOCUMENT',
  'EXPERIENCE',
  'FAQ_REQUEST',
  'POINT_ENTRY',
  'POINT_RULE',
  'SUSPICION_FLAG',
  'ADMIN_GRANT',
  'REPORT',
  'DICTIONARY_ENTRY',
  'UNMATCHED_VALUE',
  'EMPLOYMENT_REPORT',
  'USAGE_METRICS',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export function isAdminAction(value: unknown): value is AdminActionName {
  return typeof value === 'string' && Object.hasOwn(ADMIN_ACTIONS, value);
}

export function isAuditTargetType(value: unknown): value is AuditTargetType {
  return typeof value === 'string' && (AUDIT_TARGET_TYPES as readonly string[]).includes(value);
}

export const REASON_MIN_LENGTH = 3;
export const REASON_MAX_LENGTH = 1000;
const METADATA_MAX_STRING = 200;
const METADATA_MAX_ARRAY = 100;
const METADATA_MAX_KEYS = 20;

export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Record<string, AuditMetadataValue | AuditMetadataValue[]>;

// Kişisel veri içerebilecek alan ADLARI (camelCase/snake_case sözcüklerine ayrılıp karşılaştırılır).
const FORBIDDEN_KEY_WORDS = new Set([
  'email',
  'mail',
  'eposta',
  'phone',
  'telefon',
  'gsm',
  'tckn',
  'name',
  'surname',
  'firstname',
  'lastname',
  'fullname',
  'soyad',
  'ad',
  'adres',
  'address',
  'password',
  'parola',
  'sifre',
  'token',
  'secret',
  'barcode',
  'barkod',
  'link',
  'url',
]);

const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Türkiye cep telefonu (0 / +90 / 90 önekli ya da öneksiz, ayraçlı ya da bitişik) ve 11 haneli kimlik numarası.
const PHONE_PATTERN = /(?:\+?90|0)?[\s.-]?\(?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?!\d)/;
const NATIONAL_ID_PATTERN = /(?<!\d)\d{11}(?!\d)/;

export function looksLikePersonalData(text: string): boolean {
  return EMAIL_PATTERN.test(text) || PHONE_PATTERN.test(text) || NATIONAL_ID_PATTERN.test(text);
}

// Yalnız tam UUID (RFC varyantı) veya seedId'nin 24 hex biçimi. Serbest metin/gerekçe
// bu istisnaya girmez; kimlik anahtarı tek başına telefon/e-postayı aklamaz.
function isAuditIdentifier(value: string): boolean {
  return /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[0-9a-f]{24})$/i.test(
    value,
  );
}

function isIdentifierKey(key: string): boolean {
  return key === 'id' || key === 'ids' || /(?:Id|Ids|_id|_ids)$/.test(key);
}

function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+|\s+/)
    .map((word) => word.toLocaleLowerCase('tr-TR'))
    .filter(Boolean);
}

export type MetadataProblem = { path: string; problem: string };

/**
 * Metadata düz bir nesne olmalı: değerler metin/sayı/mantıksal/boş ya da bunların dizisi. Kişisel veri
 * adı taşıyan anahtar ya da e-posta/telefon/kimlik numarası gibi görünen değer reddedilir. Bu, yazarın
 * “yalnız kimlikler” kuralına uyduğunu doğrulayan bir ağdır; asıl koruma çağıranın yalnız kimlik
 * yazmasıdır.
 */
export function findMetadataProblems(metadata: unknown): MetadataProblem[] {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [{ path: '(kök)', problem: 'metadata düz bir nesne olmalı' }];
  }
  const problems: MetadataProblem[] = [];
  const entries = Object.entries(metadata);
  if (entries.length > METADATA_MAX_KEYS) {
    problems.push({ path: '(kök)', problem: `en fazla ${METADATA_MAX_KEYS} alan` });
  }

  const checkPrimitive = (path: string, value: unknown, identifierField: boolean) => {
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) problems.push({ path, problem: 'sayı sonlu olmalı' });
      return;
    }
    if (typeof value === 'string') {
      if (value.length > METADATA_MAX_STRING) {
        problems.push({ path, problem: `metin en fazla ${METADATA_MAX_STRING} karakter` });
      } else if (!(identifierField && isAuditIdentifier(value)) && looksLikePersonalData(value)) {
        problems.push({ path, problem: 'kişisel veri gibi görünen değer' });
      }
      return;
    }
    problems.push({ path, problem: 'yalnız metin, sayı, mantıksal ya da boş değer' });
  };

  for (const [key, value] of entries) {
    if (keyWords(key).some((word) => FORBIDDEN_KEY_WORDS.has(word))) {
      problems.push({ path: key, problem: 'kişisel veri adı taşıyan alan' });
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > METADATA_MAX_ARRAY) {
        problems.push({ path: key, problem: `en fazla ${METADATA_MAX_ARRAY} öğe` });
        continue;
      }
      value.forEach((item, index) =>
        checkPrimitive(`${key}[${index}]`, item, isIdentifierKey(key)),
      );
    } else {
      checkPrimitive(key, value, isIdentifierKey(key));
    }
  }
  return problems;
}

export type ReasonProblem = 'REQUIRED' | 'INVALID';

/** Gerekçe: gerektiğinde zorunlu; verilmişse 3–1000 karakter ve kişisel veri içermez. */
export function findReasonProblem(
  action: AdminActionName,
  reason: string | null | undefined,
): ReasonProblem | null {
  const text = reason?.trim() ?? '';
  if (text === '') return ADMIN_ACTIONS[action].reasonRequired ? 'REQUIRED' : null;
  if (text.length < REASON_MIN_LENGTH || text.length > REASON_MAX_LENGTH) return 'INVALID';
  if (looksLikePersonalData(text)) return 'INVALID';
  return null;
}
