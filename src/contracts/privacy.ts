import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { emailSchema } from './auth';
import { ONBOARDING_STEPS, profileTagSchema } from './profile';

/**
 * KVKK sözleşmesi (P1-03; docs/security.md “KVKK”, docs/legal-drafts.md). Servis (W1) ve ekran (W2) bunu
 * paylaşır; ikisi de DEĞİŞTİRMEZ (değişiklik `ORTAK DOSYA İSTEĞİ`). Zod hata mesajları bir `ErrorCode`'dur.
 * Enum değerleri Prisma şemasıyla aynıdır (şema testi eşitliği korur).
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

// ---------------------------------------------------------------------------------------------
// Rıza (sürümlü, yalnız eklenir)
// ---------------------------------------------------------------------------------------------

export const CONSENT_DOCUMENTS = [
  'PRIVACY_NOTICE',
  'TERMS_OF_USE',
  'CROSS_BORDER_TRANSFER',
] as const;
export type ConsentDocument = (typeof CONSENT_DOCUMENTS)[number];

/** Kayıtta ZORUNLU onaylar; yoksa kullanıcı uygulamayı kullanamaz (onay ekranına yönlenir). */
export const REQUIRED_CONSENT_DOCUMENTS = [
  'PRIVACY_NOTICE',
  'TERMS_OF_USE',
] as const satisfies readonly ConsentDocument[];

/**
 * Yürürlükteki metin sürümleri (docs/legal-drafts.md “Sürüm”). Metin değişince burada sürüm artar ve
 * kullanıcı yeniden onaya yönlenir. Yurt dışına aktarım açık rızası İSTEĞE BAĞLIDIR: yoksa CV ayrıştırma
 * kapalı (elle giriş açık), online randevuda mentor kendi linkini girer.
 */
export const CURRENT_CONSENT_VERSIONS = {
  PRIVACY_NOTICE: 'taslak-1',
  TERMS_OF_USE: 'taslak-1',
  CROSS_BORDER_TRANSFER: 'taslak-1',
} as const satisfies Record<ConsentDocument, string>;

/** Veritabanı CHECK'iyle aynı biçim (`Consent_version_check`). */
export const consentVersionSchema = z
  .string({ error: INVALID })
  .regex(/^[a-z0-9][a-z0-9.-]{0,31}$/, { error: INVALID });

export const consentDecisionSchema = z.object({
  documentType: z.enum(CONSENT_DOCUMENTS, { error: INVALID }),
  /** Kullanıcının ekranda gördüğü sürüm; güncel değilse `CONSENT_VERSION_OUTDATED`. */
  version: consentVersionSchema,
  granted: z.boolean({ error: INVALID }),
});

/**
 * Onay ver / yenile / (isteğe bağlı rızayı) geri çek. Her karar YENİ bir satırdır. Zorunlu belge
 * `granted: false` ile gönderilemez (`CONSENT_REQUIRED`; zorunlu rızanın geri çekilmesi hesap silmedir).
 */
export const recordConsentsSchema = z.object({
  decisions: z
    .array(consentDecisionSchema, { error: INVALID })
    .min(1, { error: INVALID })
    .max(CONSENT_DOCUMENTS.length, { error: INVALID })
    .refine((list) => new Set(list.map((item) => item.documentType)).size === list.length, {
      error: INVALID,
    }),
});
export type RecordConsentsInput = z.input<typeof recordConsentsSchema>;

/**
 * Belge başına durum. `needsAction`: zorunlu belge hiç onaylanmamış ya da onaylanan sürüm güncel değil.
 * İsteğe bağlı belge için yalnız bilgi verir, uygulamayı kilitlemez.
 */
export const consentDocumentStateSchema = z.object({
  documentType: z.enum(CONSENT_DOCUMENTS),
  required: z.boolean(),
  currentVersion: consentVersionSchema,
  /** En son kararın sürümü ve sonucu; hiç karar yoksa null. */
  lastDecision: z
    .object({ version: consentVersionSchema, granted: z.boolean(), decidedAt: z.date() })
    .nullable(),
  needsAction: z.boolean(),
});

export const consentStateSchema = z.object({
  documents: z.array(consentDocumentStateSchema),
  /** Zorunlu bir belge onay bekliyorsa true: ekran/proxy onay adımına yönlendirir. */
  blocking: z.boolean(),
});
export type ConsentState = z.infer<typeof consentStateSchema>;

// ---------------------------------------------------------------------------------------------
// Alan görünürlüğü
// ---------------------------------------------------------------------------------------------

export const CONTACT_FIELDS = ['EMAIL', 'PHONE', 'SOCIAL_LINKS', 'LINKEDIN'] as const;
// Kontrollü iletişim ve JSON veri dökümü aynı durum kümesini paylaşır.
export const CONTACT_REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'REVOKED',
] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export const VISIBILITY_LEVELS = ['PRIVATE', 'ON_APPROVED_REQUEST', 'MEMBERS'] as const;
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

/** Satır yoksa geçerli seviye (docs/security.md): iletişim gizli, sosyal bağlantılar üyelere açık. */
export const DEFAULT_FIELD_VISIBILITY = {
  EMAIL: 'ON_APPROVED_REQUEST',
  PHONE: 'ON_APPROVED_REQUEST',
  SOCIAL_LINKS: 'MEMBERS',
  LINKEDIN: 'MEMBERS',
} as const satisfies Record<ContactField, VisibilityLevel>;

export const setFieldVisibilitySchema = z.object({
  field: z.enum(CONTACT_FIELDS, { error: INVALID }),
  level: z.enum(VISIBILITY_LEVELS, { error: INVALID }),
});
export type SetFieldVisibilityInput = z.input<typeof setFieldVisibilitySchema>;

export const fieldVisibilitySettingsSchema = z.object({
  fields: z.array(
    z.object({
      field: z.enum(CONTACT_FIELDS),
      level: z.enum(VISIBILITY_LEVELS),
      /** Kullanıcı henüz seçmedi; varsayılan geçerli. */
      isDefault: z.boolean(),
    }),
  ),
});
export type FieldVisibilitySettings = z.infer<typeof fieldVisibilitySettingsSchema>;

// ---------------------------------------------------------------------------------------------
// Hesap silme (K-09, PM kararı) ve veri dökümü
// ---------------------------------------------------------------------------------------------

/**
 * Yayınlanmış içeriğin (deneyim, SSS cevabı) akıbeti — kullanıcıya SORULUR:
 *  - `DELETE` (varsayılan): yayınlanmış içerik de silinir.
 *  - `ANONYMIZE`: içerik kalır, yazar bağı koparılır (hiçbir yanıtta, moderasyon dahil, yazar görünmez).
 * Her iki seçenekte: oturumlar düşer, kişisel alanlar anında temizlenir, dosyalar silinir, giriş yapılamaz.
 * Ekran her seçeneğin altında `ACCOUNT_DELETION_EFFECTS` sonuçlarını açıklar (metinler katalogda).
 */
export const PUBLISHED_CONTENT_CHOICES = ['DELETE', 'ANONYMIZE'] as const;
export const DEFAULT_PUBLISHED_CONTENT_CHOICE =
  'DELETE' satisfies (typeof PUBLISHED_CONTENT_CHOICES)[number];

export const ACCOUNT_DELETION_EFFECTS = {
  common: ['SESSIONS_ENDED', 'PERSONAL_DATA_ERASED', 'FILES_DELETED', 'SIGN_IN_DISABLED'],
  DELETE: ['PUBLISHED_CONTENT_DELETED'],
  ANONYMIZE: ['PUBLISHED_CONTENT_ANONYMIZED'],
} as const;

/**
 * Onay: kullanıcı kendi e-postasını yazar (sunucu oturumdaki e-postayla karşılaştırır; uyuşmazsa
 * `ACCOUNT_DELETE_CONFIRMATION_MISMATCH`). İşlem geri alınamaz.
 */
export const deleteAccountSchema = z.object({
  publishedContent: z
    .enum(PUBLISHED_CONTENT_CHOICES, { error: INVALID })
    .default(DEFAULT_PUBLISHED_CONTENT_CHOICE),
  confirmEmail: emailSchema,
});
export type DeleteAccountInput = z.input<typeof deleteAccountSchema>;
export const deleteAccountOutputSchema = z.object({ deleted: z.literal(true) });
export type DeleteAccountOutput = z.infer<typeof deleteAccountOutputSchema>;

/**
 * Veri dökümü (KVKK m. 11): oturumdaki kullanıcının kendi verisi, JSON dosyası olarak yetki kontrollü
 * rotadan iner (servis kartı yazar). Başka kullanıcının kişisel verisi dökümde YOKTUR (iletişim
 * taleplerinde karşı taraf yalnız kullanıcı kimliğiyle tanımlanır). Yeni bölümler sonraki adımlarda eklenir.
 */
export const DATA_EXPORT_HREF = '/api/hesabim/veri-dokumu';
export const DATA_EXPORT_FORMAT_VERSION = 1;

/** Yalnız talep satırının skalerleri; karşı tarafın kullanıcı/iletişim nesnesi eklenemez. */
export const exportedContactRequestSchema = z
  .object({
    id: z.string(),
    requesterId: z.string(),
    targetId: z.string(),
    fields: z.array(z.enum(CONTACT_FIELDS)),
    message: z.string().nullable(),
    status: z.enum(CONTACT_REQUEST_STATUSES),
    createdAt: z.string(),
    updatedAt: z.string(),
    decidedAt: z.string().nullable(),
    closedAt: z.string().nullable(),
  })
  .strict();

/** CV ve profil kalemleri (P1-05). Dosya anahtarı ve sözlük kimlikleri dökülmez; yalnız kullanıcının kendi verisi. */
export const exportedCvSchema = z.object({
  uploads: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['QUEUED', 'PARSING', 'PARSED', 'FAILED', 'APPLIED', 'DISCARDED']),
      errorCode: z.string().nullable(),
      pageCount: z.number().int(),
      hasFile: z.boolean(),
      createdAt: z.string(),
      appliedAt: z.string().nullable(),
      /** Onay bekleyen (uygulanmamış) ayrıştırma önerisi; uygulanınca/atılınca silinir. */
      pendingParsedCv: z.unknown().nullable(),
    }),
  ),
  education: z.array(z.record(z.string(), z.unknown())),
  positions: z.array(z.record(z.string(), z.unknown())),
  languages: z.array(z.record(z.string(), z.unknown())),
  certifications: z.array(z.record(z.string(), z.unknown())),
  skills: z.array(z.record(z.string(), z.unknown())),
  experienceInvitations: z.array(z.object({ positionId: z.string(), status: z.string() })),
});
export type ExportedCv = z.infer<typeof exportedCvSchema>;
/** Kullanıcının kendi profili; ilişkiler yalnız etiket sözlüğüne açılır, başka kullanıcıya değil. */
export const exportedProfileSchema = z
  .object({
    id: z.string(),
    headline: z.string().nullable(),
    summary: z.string().nullable(),
    city: z.string().nullable(),
    goals: z.string().nullable(),
    socialLinks: z.json().nullable(),
    linkedinUrl: z.string().nullable(),
    completionScore: z.number().int().min(0).max(100),
    onboardingStep: z.enum(ONBOARDING_STEPS),
    completedSteps: z.array(z.enum(ONBOARDING_STEPS)),
    skippedSteps: z.array(z.enum(ONBOARDING_STEPS)),
    mentorInterested: z.boolean().nullable(),
    cvUpdatedAt: z.string().nullable(),
    lastFreshnessPromptAt: z.string().nullable(),
    lastStillThereCheckAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    tags: z.array(profileTagSchema.extend({ assignedAt: z.string(), updatedAt: z.string() })),
  })
  .strict();

export const dataExportSchema = z.object({
  formatVersion: z.literal(DATA_EXPORT_FORMAT_VERSION),
  exportedAt: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    phone: z.string().nullable(),
    createdAt: z.string(),
  }),
  profile: exportedProfileSchema.nullable(),
  memberships: z.array(z.record(z.string(), z.unknown())),
  consents: z.array(
    z.object({
      documentType: z.enum(CONSENT_DOCUMENTS),
      version: z.string(),
      granted: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  fieldVisibility: z.array(
    z.object({ field: z.enum(CONTACT_FIELDS), level: z.enum(VISIBILITY_LEVELS) }),
  ),
  contactRequests: z.object({
    sent: z.array(exportedContactRequestSchema),
    received: z.array(exportedContactRequestSchema),
  }),
  cv: exportedCvSchema,
});
export type DataExport = z.infer<typeof dataExportSchema>;

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları
// ---------------------------------------------------------------------------------------------

export const PRIVACY_ACTION_ERRORS = {
  getConsentState: ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'],
  recordConsents: [
    'VALIDATION_INVALID',
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'CONSENT_REQUIRED',
    'CONSENT_VERSION_OUTDATED',
  ],
  getFieldVisibility: ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'],
  setFieldVisibility: ['VALIDATION_INVALID', 'AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'],
  deleteAccount: [
    'VALIDATION_INVALID',
    'AUTH_UNAUTHENTICATED',
    'ACCOUNT_DELETE_CONFIRMATION_MISMATCH',
    'RATE_LIMITED',
  ],
  /** Döküm rotası (`DATA_EXPORT_HREF`) yanıt kodları. */
  dataExport: ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED', 'RATE_LIMITED'],
} as const satisfies Record<string, readonly ErrorCode[]>;
