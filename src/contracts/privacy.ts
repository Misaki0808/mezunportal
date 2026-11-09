import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { emailSchema } from './auth';
import { ONBOARDING_STEPS, profileTagSchema } from './profile';
import { EXPERIENCE_STATUSES, experienceDraftTemplateSchema } from './experience';
import { FAQ_STATUSES } from './faq';
import {
  BADGE_KINDS,
  POINT_ACTIONS,
  POINT_REVOKE_REASONS,
  POINT_STATUSES,
  SUSPICION_RULES,
  SUSPICION_STATUSES,
} from './points';

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
  /** P2-06 (D20): "staj arıyorum" görünürlüğü; İSTEĞE BAĞLI, her an geri alınır (görünürlük hemen kalkar). */
  'JOB_SEEKER_VISIBILITY',
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
  JOB_SEEKER_VISIBILITY: 'taslak-1',
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
    /** İlan kaynaklı ve `APPROVED` olmayan GİDEN talepte `null` (D7: hedef kimliği onaydan önce açılmaz). */
    targetId: z.string().nullable(),
    /** İlan kaynaklı talepte talep anındaki ilan başlığı ve kurum; doğrudan talepte `null`. */
    origin: z.object({ title: z.string(), organization: z.string() }).strict().nullable(),
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
    targetTitleId: z.string().nullable(),
    socialLinks: z.json().nullable(),
    linkedinUrl: z.string().nullable(),
    completionScore: z.number().int().min(0).max(100),
    onboardingStep: z.enum(ONBOARDING_STEPS),
    completedSteps: z.array(z.enum(ONBOARDING_STEPS)),
    skippedSteps: z.array(z.enum(ONBOARDING_STEPS)),
    mentorInterested: z.boolean().nullable(),
    seekingInternship: z.boolean(),
    seekingTermYear: z.number().int().nullable(),
    seekingTermSeason: z.enum(['SPRING', 'SUMMER', 'AUTUMN', 'WINTER']).nullable(),
    seekerViewCount: z.number().int().min(0),
    hiringDeclaredAt: z.string().nullable(),
    cvUpdatedAt: z.string().nullable(),
    lastFreshnessPromptAt: z.string().nullable(),
    lastStillThereCheckAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    tags: z.array(profileTagSchema.extend({ assignedAt: z.string(), updatedAt: z.string() })),
  })
  .strict();

/** Kendi deneyim dökümü; anonim içerikle yazar/moderatör kimliği birlikte taşınmaz. */
export const exportedExperienceSchema = z
  .object({
    id: z.string(),
    departmentIdAtWrite: z.string(),
    content: experienceDraftTemplateSchema,
    appliedMonth: z.number().int().min(1).max(12).nullable(),
    isAnonymous: z.boolean(),
    status: z.enum(EXPERIENCE_STATUSES),
    moderationNote: z.string().nullable(),
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

/** Kendi randevuların. Karşı taraf yalnız kimlikle tanımlanır; öğrenci notu yalnız onu yazanın dökümündedir. */
export const exportedAppointmentSchema = z
  .object({
    id: z.string(),
    role: z.enum(['MENTOR', 'MENTEE']),
    counterpartId: z.string(),
    feedback: z
      .object({
        happened: z.boolean(),
        helpful: z.boolean().nullable(),
        note: z.string().nullable(),
        createdAt: z.string(),
      })
      .strict()
      .nullable(),
    startsAt: z.string(),
    endsAt: z.string(),
    mode: z.enum(['ONLINE', 'IN_PERSON']),
    status: z.string(),
    note: z.string().nullable(),
    location: z.string().nullable(),
    meetUrl: z.string().nullable(),
    reason: z.string().nullable(),
    createdAt: z.string(),
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
  experiences: z.array(exportedExperienceSchema),
  companyFollows: z.array(
    z
      .object({
        companyId: z.string().nullable(),
        sectorId: z.string().nullable(),
        createdAt: z.string(),
      })
      .strict(),
  ),
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
  appointments: z.array(exportedAppointmentSchema),
  cvReviewRequests: z.array(
    z
      .object({
        id: z.string(),
        role: z.enum(['MENTOR', 'STUDENT']),
        counterpartId: z.string(),
        status: z.enum(['OPEN', 'COMPLETED', 'EXPIRED']),
        note: z.string().nullable(),
        comment: z.string().nullable(),
        createdAt: z.string(),
        expiresAt: z.string(),
        answeredAt: z.string().nullable(),
        helpfulAt: z.string().nullable(),
      })
      .strict(),
  ),
  /** SSS (P1-17): kendi soruların ve yazdığın cevaplar. Başka kullanıcıya ait hiçbir alan yok. */
  faq: z
    .object({
      requests: z.array(
        z
          .object({
            id: z.string(),
            question: z.string(),
            status: z.enum(FAQ_STATUSES),
            decisionNote: z.string().nullable(),
            createdAt: z.string(),
            decidedAt: z.string().nullable(),
          })
          .strict(),
      ),
      answers: z.array(
        z
          .object({
            id: z.string(),
            body: z.string(),
            isSelected: z.boolean(),
            createdAt: z.string(),
          })
          .strict(),
      ),
    })
    .strict(),
  /** İlanlar (P2-04): yalnız kendi yazdığın ilanlar (değer kümeleri `contracts/job-postings` ile aynıdır; döngüsel içe aktarma olmasın diye burada yazılıdır, test eşitliği korur). Moderatör, şikâyet eden ve başka kullanıcıya ait alan yok. */
  jobPostings: z.array(
    z
      .object({
        id: z.string(),
        kind: z.enum(['INTERNSHIP', 'JOB']),
        title: z.string().nullable(),
        organizationName: z.string().nullable(),
        location: z.string().nullable(),
        isRemote: z.boolean(),
        description: z.string().nullable(),
        applyMethod: z.enum(['URL', 'CONTACT_REQUEST']).nullable(),
        applyUrl: z.string().nullable(),
        deadlineOn: z.string().nullable(),
        status: z.enum(['DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'EXPIRED', 'CLOSED']),
        moderationNote: z.string().nullable(),
        tagIds: z.array(z.string()),
        targetGrades: z.array(z.number().int()),
        createdAt: z.string(),
        publishedAt: z.string().nullable(),
      })
      .strict(),
  ),
  /** Referans beyanları: yalnız ilgili kişinin katıldığı kayıtlar. */
  referrals: z.array(
    z
      .object({
        id: z.string(),
        role: z.enum(['ALUMNI', 'STUDENT']),
        status: z.string(),
        organizationName: z.string().nullable(),
        note: z.string().nullable(),
        acceptanceNote: z.string().nullable(),
        decisionReason: z.string().nullable(),
        acceptanceReason: z.string().nullable(),
        createdAt: z.string(),
      })
      .strict(),
  ),
  /** Yalnız bu kullanıcıya yazılmış ilan eşleşmeleri; üçüncü kişinin verisi yok. */
  jobMatches: z.array(z.object({ postingId: z.string(), createdAt: z.string() }).strict()),
  /** Katkı puanı (P1-16): kaynak içerik ve karşı taraf kimliği YOK (anonim deneyim bağı ve üçüncü kişi sızmaz). */
  contribution: z
    .object({
      entries: z.array(
        z
          .object({
            action: z.enum(POINT_ACTIONS),
            basePoints: z.number().int(),
            multiplierPercent: z.number().int(),
            points: z.number().int(),
            status: z.enum(POINT_STATUSES),
            eventAt: z.string(),
            createdAt: z.string(),
            revokedReason: z.enum(POINT_REVOKE_REASONS).nullable(),
          })
          .strict(),
      ),
      badges: z.array(
        z
          .object({
            kind: z.enum(BADGE_KINDS),
            awardedAt: z.string(),
            revokedAt: z.string().nullable(),
          })
          .strict(),
      ),
      /** Şüphe işaretleri: yalnız kural, durum ve tarihler (eşikler ve kanıt kimlikleri çıkmaz). */
      suspicionFlags: z.array(
        z
          .object({
            rule: z.enum(SUSPICION_RULES),
            status: z.enum(SUSPICION_STATUSES),
            createdAt: z.string(),
            decidedAt: z.string().nullable(),
          })
          .strict(),
      ),
    })
    .strict(),
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
