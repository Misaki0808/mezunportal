import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

/**
 * Yönetim paneli sözleşmesi (P1-11; D5, D6; docs/security.md "Yetkilendirme", "Yönetici işlem kaydı").
 * Panel sorgularını yazan servis (W2) ve ekran bunu paylaşır; DEĞİŞTİRMEZLER (değişiklik `ORTAK DOSYA İSTEĞİ`).
 * Kullanıcı yönetimi (arama, askıya alma, üyelik düzeltme, yönetici atama) `admin-users.ts`'tedir.
 *
 * İlkeler (hepsi sunucuda zorlanır; ekran yalnız ipucu olarak kullanır):
 *  - Kimlik oturumdan gelir; istemciden rol/kapsam alınmaz. `departmentId`/`facultyId` süzgeçleri YETKİ VERMEZ,
 *    her sorgu yöneticinin kapsamıyla kesişir (kapsam dışı satır hiçbir yanıtta yoktur).
 *  - Telefon ve e-posta çıktı şemalarında YALNIZ maskelidir (`maskedEmail`, `maskedPhone`); ham değer alanı yoktur.
 *  - Her yıkıcı/yetki değiştiren eylem `recordAdminAction` ile AYNI işlemde yazılır; gerekçe kişisel veri içeremez.
 *  - Excel dışa aktarma yalnız TOPLU sayılar içerir; kişi satırı yoktur (bkz. `EMPLOYMENT_EXPORT_SHEETS`).
 */

export const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

// ---------------------------------------------------------------------------------------------
// Ortak yapı taşları
// ---------------------------------------------------------------------------------------------

export const adminId = z
  .string({ error: INVALID })
  .trim()
  .min(1, { error: INVALID })
  .max(64, { error: INVALID });

/** Gerekçe: 3–1000 karakter; kişisel veri içermesi sunucuda (`rules/adminAudit`) ayrıca reddedilir. */
export const ADMIN_REASON_MIN = 3;
export const ADMIN_REASON_MAX = 1000;
export const adminReason = z
  .string({ error: INVALID })
  .trim()
  .min(ADMIN_REASON_MIN, { error: INVALID })
  .max(ADMIN_REASON_MAX, { error: INVALID });

/** Açık kullanıcı onayı; eksik/false değer sessizce kabul edilmez. */
export const adminConfirmation = z.literal(true, { error: INVALID });
/** Çıktıda ad değil değer de maskeli olmalıdır; maskEmail/maskPhone biçimleriyle uyumludur. */
export const maskedAdminEmailSchema = z
  .string()
  .regex(/^(?:\*{3}|[^@\s*]\*{3}@(?:[^@\s*]\*{3}\.)?[^@\s*]+(?:\.[^@\s*]+)*)$/);
export const maskedAdminPhoneSchema = z.string().regex(/^(?:\*{3}|\*{3} \*{3} \*{2} \d{2})$/);

export const ADMIN_PAGE_SIZE_DEFAULT = 20;
export const ADMIN_PAGE_SIZE_MAX = 50;
export const adminPageInput = {
  cursor: adminId.optional(),
  limit: z
    .number({ error: INVALID })
    .int({ error: INVALID })
    .min(1, { error: INVALID })
    .max(ADMIN_PAGE_SIZE_MAX, { error: INVALID })
    .default(ADMIN_PAGE_SIZE_DEFAULT),
};

export const ADMIN_SEARCH_MIN = 2;
export const ADMIN_SEARCH_MAX = 100;
export const adminSearchText = z
  .string({ error: INVALID })
  .trim()
  .min(ADMIN_SEARCH_MIN, { error: INVALID })
  .max(ADMIN_SEARCH_MAX, { error: INVALID });

// ---------------------------------------------------------------------------------------------
// Erişim tablosu: hangi eylem kime açık (tablo-güdümlü testin ve ekranın tek kaynağı)
// ---------------------------------------------------------------------------------------------

/**
 * `ANY_ADMIN`: etkin yönetici yetkisi (bölüm/fakülte/sistem) + doğrulanmış üyelik; veri yöneticinin kapsamıyla
 * süzülür. `SYSTEM_ONLY`: yalnız sistem yöneticisi (docs/security.md matrisi son satır + işlem kaydı görüntüleme).
 */
export const ADMIN_ACCESS_LEVELS = ['ANY_ADMIN', 'SYSTEM_ONLY'] as const;
export type AdminAccessLevel = (typeof ADMIN_ACCESS_LEVELS)[number];

export const ADMIN_ACTION_ACCESS = {
  getAdminOverview: 'ANY_ADMIN',
  listAdminReports: 'ANY_ADMIN',
  getEmploymentReport: 'ANY_ADMIN',
  searchUsers: 'ANY_ADMIN',
  getUserDetail: 'ANY_ADMIN',
  suspendUser: 'ANY_ADMIN',
  unsuspendUser: 'ANY_ADMIN',
  correctMembership: 'ANY_ADMIN',
  listDictionaryEntries: 'SYSTEM_ONLY',
  createDictionaryEntry: 'SYSTEM_ONLY',
  updateDictionaryEntry: 'SYSTEM_ONLY',
  deleteDictionaryEntry: 'SYSTEM_ONLY',
  listUnmatchedValues: 'SYSTEM_ONLY',
  resolveUnmatchedValue: 'SYSTEM_ONLY',
  listAdminGrants: 'SYSTEM_ONLY',
  grantAdmin: 'SYSTEM_ONLY',
  revokeAdmin: 'SYSTEM_ONLY',
  listAuditLog: 'SYSTEM_ONLY',
} as const satisfies Record<string, AdminAccessLevel>;
export type AdminActionName = keyof typeof ADMIN_ACTION_ACCESS;

/** Sunucu eylemi olmayan, yetki kuralı aynı olan rotalar (Excel dışa aktarma: `EMPLOYMENT_EXPORT_HREF`). */
export const ADMIN_ROUTE_ACCESS = { employmentExport: 'ANY_ADMIN' } as const satisfies Record<
  string,
  AdminAccessLevel
>;

// ---------------------------------------------------------------------------------------------
// Genel bakış (panel girişi)
// ---------------------------------------------------------------------------------------------

export const ADMIN_LEVELS = ['SYSTEM', 'FACULTY', 'DEPARTMENT'] as const;

/** Ekranın hangi bölümleri göstereceği; sunucu her eylemde yetkiyi YİNE denetler. */
export const adminCapabilitiesSchema = z
  .object({
    users: z.boolean(),
    reports: z.boolean(),
    employmentReport: z.boolean(),
    dictionaries: z.boolean(),
    unmatchedValues: z.boolean(),
    adminGrants: z.boolean(),
    auditLog: z.boolean(),
  })
  .strict();

export const managedDepartmentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    facultyId: z.string(),
    facultyName: z.string(),
  })
  .strict();

export const adminOverviewSchema = z
  .object({
    /** Yöneticinin sahip olduğu en yüksek kapsam. */
    level: z.enum(ADMIN_LEVELS),
    /** Kapsamdaki bölümler (süzgeç açılır listesi). Sistem yöneticisinde bütün bölümler. */
    departments: z.array(managedDepartmentSchema),
    capabilities: adminCapabilitiesSchema,
    /** Kapsamdaki bekleyen iş sayıları (rozetler). */
    counts: z
      .object({
        pendingGraduationDocuments: z.number().int().min(0),
        pendingExperiences: z.number().int().min(0),
        openReports: z.number().int().min(0),
        suspendedUsers: z.number().int().min(0),
        /** Yalnız sistem yöneticisinde; diğerlerinde `null`. */
        openUnmatchedValues: z.number().int().min(0).nullable(),
      })
      .strict(),
  })
  .strict();
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

// ---------------------------------------------------------------------------------------------
// Şikâyet kuyruğu (P1-07 `Report`; karar için `resolveExperienceReport` kullanılır)
// ---------------------------------------------------------------------------------------------

export const ADMIN_REPORT_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;

/** `departmentId` süzgeci yetki vermez; kuyruk her zaman yöneticinin kapsamıyla kesişir. */
export const listAdminReportsSchema = z
  .object({
    ...adminPageInput,
    departmentId: adminId.optional(),
    status: z.enum(ADMIN_REPORT_STATUSES, { error: INVALID }).default('OPEN'),
  })
  .strict();
export type ListAdminReportsInput = z.input<typeof listAdminReportsSchema>;

/**
 * Şikâyet + moderatörün karar vermesi için hedef özeti. Raportör, deneyim yazarı ve moderatör kimliği YOKTUR
 * (anonim deneyimin yazarı hiçbir çıktıda bulunmaz).
 */
export const adminReportItemSchema = z
  .object({
    id: z.string(),
    status: z.enum(ADMIN_REPORT_STATUSES),
    reason: z.string(),
    createdAt: z.date(),
    reviewedAt: z.date().nullable(),
    resolutionNote: z.string().nullable(),
    target: z
      .object({
        type: z.literal('EXPERIENCE'),
        id: z.string(),
        experienceType: z.string(),
        organizationName: z.string().nullable(),
        isAnonymous: z.boolean(),
        departmentId: z.string(),
        departmentName: z.string(),
        /** Aynı hedefe açık şikâyet sayısı (öncelik ipucu). */
        openReportCount: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();
export const adminReportPageSchema = z
  .object({ items: z.array(adminReportItemSchema), nextCursor: z.string().nullable() })
  .strict();
export type AdminReportPage = z.infer<typeof adminReportPageSchema>;

// ---------------------------------------------------------------------------------------------
// Sözlük yönetimi (yalnız sistem yöneticisi)
// ---------------------------------------------------------------------------------------------

export const DICTIONARY_KINDS = ['COMPANY', 'TITLE', 'SKILL', 'SECTOR'] as const;
export type DictionaryKind = (typeof DICTIONARY_KINDS)[number];

export const DICTIONARY_NAME_MAX = 200;
export const DICTIONARY_ALIASES_MAX = 20;
const dictionaryName = z
  .string({ error: INVALID })
  .trim()
  .min(2, { error: INVALID })
  .max(DICTIONARY_NAME_MAX, { error: INVALID });
/** Takma adlar servis tarafında `normalizeName` ile saklanır; yinelenenler birleşir. */
const dictionaryAliases = z
  .array(dictionaryName, { error: INVALID })
  .max(DICTIONARY_ALIASES_MAX, { error: INVALID });

export const listDictionaryEntriesSchema = z
  .object({
    ...adminPageInput,
    kind: z.enum(DICTIONARY_KINDS, { error: INVALID }),
    query: adminSearchText.optional(),
  })
  .strict();
export type ListDictionaryEntriesInput = z.input<typeof listDictionaryEntriesSchema>;

export const dictionaryEntrySchema = z
  .object({
    id: z.string(),
    kind: z.enum(DICTIONARY_KINDS),
    name: z.string(),
    /** Normalleştirilmiş takma adlar (sektörde yoktur). */
    aliases: z.array(z.string()),
    /** Yalnız şirkette: bağlı sektör. */
    sectorId: z.string().nullable(),
    sectorName: z.string().nullable(),
    /** Bu kaydı kullanan profil kalemi sayısı (silmeden önce uyarı için). */
    usageCount: z.number().int().min(0),
  })
  .strict();
export const dictionaryEntryPageSchema = z
  .object({ items: z.array(dictionaryEntrySchema), nextCursor: z.string().nullable() })
  .strict();
export type DictionaryEntryPage = z.infer<typeof dictionaryEntryPageSchema>;

/** `sectorId` yalnız `COMPANY` için anlamlıdır; başka türde verilirse `VALIDATION_INVALID`. */
export const createDictionaryEntrySchema = z
  .object({
    kind: z.enum(DICTIONARY_KINDS, { error: INVALID }),
    name: dictionaryName,
    aliases: dictionaryAliases.default([]),
    sectorId: adminId.optional(),
  })
  .strict()
  .refine((value) => value.sectorId === undefined || value.kind === 'COMPANY', {
    error: INVALID,
    path: ['sectorId'],
  });
export type CreateDictionaryEntryInput = z.input<typeof createDictionaryEntrySchema>;

export const updateDictionaryEntrySchema = z
  .object({
    kind: z.enum(DICTIONARY_KINDS, { error: INVALID }),
    id: adminId,
    name: dictionaryName.optional(),
    aliases: dictionaryAliases.optional(),
    /** `null`: sektör bağını kaldır. */
    sectorId: adminId.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined || value.aliases !== undefined || value.sectorId !== undefined,
    { error: INVALID },
  )
  .refine((value) => value.sectorId === undefined || value.kind === 'COMPANY', {
    error: INVALID,
    path: ['sectorId'],
  });
export type UpdateDictionaryEntryInput = z.input<typeof updateDictionaryEntrySchema>;

/** Silinen kaydı kullanan profil kalemlerinin bağı boşalır, ham metinleri kalır. */
export const deleteDictionaryEntrySchema = z
  .object({
    kind: z.enum(DICTIONARY_KINDS, { error: INVALID }),
    id: adminId,
    reason: adminReason,
    confirmed: adminConfirmation,
  })
  .strict();
export type DeleteDictionaryEntryInput = z.input<typeof deleteDictionaryEntrySchema>;

export const dictionaryEntryIdOutputSchema = z
  .object({ kind: z.enum(DICTIONARY_KINDS), id: z.string() })
  .strict();
export type DictionaryEntryIdOutput = z.infer<typeof dictionaryEntryIdOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Eşleşmeyen değerler (CV hattı yönetici kuyruğu; yalnız sistem yöneticisi)
// ---------------------------------------------------------------------------------------------

export const UNMATCHED_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;

export const listUnmatchedValuesSchema = z
  .object({
    ...adminPageInput,
    kind: z.enum(DICTIONARY_KINDS, { error: INVALID }).optional(),
    status: z.enum(UNMATCHED_STATUSES, { error: INVALID }).default('OPEN'),
  })
  .strict();
export type ListUnmatchedValuesInput = z.input<typeof listUnmatchedValuesSchema>;

export const unmatchedValueSchema = z
  .object({
    id: z.string(),
    kind: z.enum(DICTIONARY_KINDS),
    rawValue: z.string(),
    normalizedValue: z.string(),
    /** Değeri onaylayan kullanıcı sayısı. */
    count: z.number().int().min(1),
    status: z.enum(UNMATCHED_STATUSES),
    /** `RESOLVED` ise bağlandığı sözlük kaydı. */
    resolvedTo: z.object({ id: z.string(), name: z.string() }).strict().nullable(),
    /** En benzer sözlük kayıtları (karar ipucu; en fazla 3). */
    suggestions: z.array(z.object({ id: z.string(), name: z.string() }).strict()).max(3),
  })
  .strict();
export const unmatchedValuePageSchema = z
  .object({ items: z.array(unmatchedValueSchema), nextCursor: z.string().nullable() })
  .strict();
export type UnmatchedValuePage = z.infer<typeof unmatchedValuePageSchema>;

/**
 * `LINK`: değer mevcut kaydın takma adı olur (yazım hatası/farklı yazım); `CREATE`: yeni kayıt açılır ve değer
 * ona bağlanır; `DISMISS`: değer anlamsızdır, kuyruktan düşer (aynı değer yeniden gelirse sayaç artar, açılmaz).
 * Servis payı `UnmatchedValue.dismissedAt` kolonunu ekler (P1-05 şeması birleşince, ekleyici migration).
 */
export const resolveUnmatchedValueSchema = z
  .object({
    id: adminId,
    resolution: z.discriminatedUnion(
      'type',
      [
        z.object({ type: z.literal('LINK'), entryId: adminId }).strict(),
        z
          .object({
            type: z.literal('CREATE'),
            name: dictionaryName,
            aliases: dictionaryAliases.default([]),
            sectorId: adminId.optional(),
          })
          .strict(),
        z
          .object({ type: z.literal('DISMISS'), reason: adminReason, confirmed: adminConfirmation })
          .strict(),
      ],
      { error: INVALID },
    ),
  })
  .strict();
export type ResolveUnmatchedValueInput = z.input<typeof resolveUnmatchedValueSchema>;

export const resolveUnmatchedValueOutputSchema = z
  .object({
    id: z.string(),
    status: z.enum(['RESOLVED', 'DISMISSED']),
    entryId: z.string().nullable(),
  })
  .strict();
export type ResolveUnmatchedValueOutput = z.infer<typeof resolveUnmatchedValueOutputSchema>;

// ---------------------------------------------------------------------------------------------
// İşlem kaydı görüntüleme (yalnız sistem yöneticisi)
// ---------------------------------------------------------------------------------------------

/**
 * `src/server/rules/adminAudit.ts` `ADMIN_ACTIONS` anahtarlarının aynısı (eşitliği sözleşme testi korur;
 * sözleşme sunucu koduna bağlanmaz).
 */
export const AUDIT_ACTION_NAMES = [
  'DOCUMENT_APPROVE',
  'DOCUMENT_REJECT',
  'ROLE_CORRECT',
  'ROLE_TRANSITION',
  'USER_SUSPEND',
  'USER_UNSUSPEND',
  'MODERATION_PUBLISH',
  'MODERATION_REJECT',
  'MODERATION_REDIRECT',
  'REPORT_RESOLVE',
  'POINTS_REVOKE',
  'POINT_RULE_CHANGE',
  'POINTS_BACKFILL',
  'SUSPICION_DECIDE',
  'ADMIN_GRANT',
  'ADMIN_REVOKE',
  'DATA_EXPORT',
  'DICTIONARY_CHANGE',
  'UNMATCHED_RESOLVE',
] as const;
export type AuditActionName = (typeof AUDIT_ACTION_NAMES)[number];

export const AUDIT_TARGET_TYPE_NAMES = [
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

export const listAuditLogSchema = z
  .object({
    ...adminPageInput,
    action: z.enum(AUDIT_ACTION_NAMES, { error: INVALID }).optional(),
    targetType: z.enum(AUDIT_TARGET_TYPE_NAMES, { error: INVALID }).optional(),
    targetId: adminId.optional(),
    actorId: adminId.optional(),
    from: z.coerce.date({ error: INVALID }).optional(),
    to: z.coerce.date({ error: INVALID }).optional(),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from.getTime() <= value.to.getTime(), {
    error: INVALID,
    path: ['to'],
  });
export type ListAuditLogInput = z.input<typeof listAuditLogSchema>;

/**
 * İşlem kaydı satırı. `metadata` yalnız kimlik ve sade değerlerdir (yazımda kişisel veri reddedilir);
 * `actorName` okuma anında kullanıcı tablosundan gelir (silinmiş hesapta yer tutucu ad).
 */
export const auditLogEntrySchema = z
  .object({
    id: z.string(),
    actorId: z.string(),
    actorName: z.string(),
    action: z.string(),
    targetType: z.string(),
    targetId: z.string(),
    reason: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    createdAt: z.date(),
  })
  .strict();
export const auditLogPageSchema = z
  .object({ items: z.array(auditLogEntrySchema), nextCursor: z.string().nullable() })
  .strict();
export type AuditLogPage = z.infer<typeof auditLogPageSchema>;

// ---------------------------------------------------------------------------------------------
// Mezun istihdam raporu ve Excel dışa aktarma (toplu)
// ---------------------------------------------------------------------------------------------

export const EMPLOYMENT_DIMENSIONS = ['SECTOR', 'TITLE', 'COMPANY'] as const;
export type EmploymentDimension = (typeof EMPLOYMENT_DIMENSIONS)[number];

/**
 * Küçük hücre bastırma: bu sayının altındaki gruplar tek tek gösterilmez, `OTHER` kovasında birleşir (o da
 * eşiğin altındaysa hiç gösterilmez). Toplu rapor tek bir kişiyi tanımlamaz.
 */
export const REPORT_MIN_GROUP_SIZE = 3;

/**
 * Sayım kuralı: kapsamdaki (doğrulanmış, etkin ya da kapanmış) MEZUN üyeliği olan her kullanıcı bir kez sayılır;
 * unvan/şirket/sektör kullanıcının güncel pozisyonundan (yoksa en son biten pozisyondan) gelir. Yalnız SÖZLÜKLE
 * eşleşen adlar gösterilir; eşleşmeyen ham metin `UNKNOWN` kovasındadır (serbest metin rapora girmez).
 */
export const EMPLOYMENT_COUNTING_RULE = 'CURRENT_OR_LATEST_POSITION' as const;

/** `departmentId` ile `facultyId` birlikte verilemez; ikisi de yoksa yöneticinin bütün kapsamı. Süzgeç yetki vermez. */
export const employmentReportFilterSchema = z
  .object({
    departmentId: adminId.optional(),
    facultyId: adminId.optional(),
    graduationYearFrom: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1950)
      .max(2100)
      .optional(),
    graduationYearTo: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1950)
      .max(2100)
      .optional(),
  })
  .strict()
  .refine((value) => !(value.departmentId && value.facultyId), {
    error: INVALID,
    path: ['facultyId'],
  })
  .refine(
    (value) =>
      value.graduationYearFrom === undefined ||
      value.graduationYearTo === undefined ||
      value.graduationYearFrom <= value.graduationYearTo,
    { error: INVALID, path: ['graduationYearTo'] },
  );
export type EmploymentReportFilter = z.input<typeof employmentReportFilterSchema>;

export const employmentBucketSchema = z
  .object({
    /** `NAMED`: sözlük kaydı · `UNKNOWN`: sözlükte yok/bilinmiyor · `OTHER`: küçük gruplar birleşimi. */
    type: z.enum(['NAMED', 'UNKNOWN', 'OTHER']),
    /** Yalnız `NAMED`'de sözlük adı. */
    label: z.string().nullable(),
    /** Her kova en az `REPORT_MIN_GROUP_SIZE` kişidir (altındakiler `OTHER`'a katılır ya da hiç gösterilmez). */
    count: z.number().int().min(REPORT_MIN_GROUP_SIZE),
  })
  .strict();

export const employmentReportSchema = z
  .object({
    generatedAt: z.date(),
    minGroupSize: z.literal(REPORT_MIN_GROUP_SIZE),
    /** Kapsamdaki mezun sayısı. */
    totalAlumni: z.number().int().min(0),
    /** En az bir pozisyonu olan mezun sayısı. */
    alumniWithPosition: z.number().int().min(0),
    distributions: z
      .object({
        SECTOR: z.array(employmentBucketSchema),
        TITLE: z.array(employmentBucketSchema),
        COMPANY: z.array(employmentBucketSchema),
      })
      .strict(),
  })
  .strict();
export type EmploymentReport = z.infer<typeof employmentReportSchema>;

/**
 * Excel: `GET EMPLOYMENT_EXPORT_HREF?<süzgeç>` (sunucu rotası, `exportEmploymentReport` eylemiyle aynı yetki ve
 * süzgeç şeması). Her dışa aktarma `DATA_EXPORT` işlem kaydı yazar (hedef `EMPLOYMENT_REPORT`, metadata yalnız
 * kapsam kimlikleri ve yıllar). Dosyada KİŞİ SATIRI YOKTUR: yalnız aşağıdaki toplu sayfalar. Türkçe karakterler
 * için `.xlsx` (UTF-8) kullanılır.
 */
export const EMPLOYMENT_EXPORT_HREF = '/api/yonetim/rapor/istihdam';
export const EMPLOYMENT_EXPORT_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const EMPLOYMENT_EXPORT_FILE_NAME = 'mezun-istihdam-raporu.xlsx';
export const EMPLOYMENT_EXPORT_SHEETS = [
  { name: 'Özet', columns: ['Alan', 'Değer'] },
  { name: 'Sektör', dimension: 'SECTOR', columns: ['Sektör', 'Mezun sayısı'] },
  { name: 'Unvan', dimension: 'TITLE', columns: ['Unvan', 'Mezun sayısı'] },
  { name: 'Şirket', dimension: 'COMPANY', columns: ['Şirket', 'Mezun sayısı'] },
] as const;
/** Kullanıcı başına saatte 10 dışa aktarma; süreçler arası sayaç servis payında `RateLimit`'e bağlanır. */
export const EMPLOYMENT_EXPORT_RATE_LIMIT = { maxRequests: 10, windowSeconds: 3600 } as const;

/** `href`: süzgeçli dışa aktarma bağlantısı (yalnız tanımlı alanlar eklenir). */
export function employmentExportHref(filter: EmploymentReportFilter = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(employmentReportFilterSchema.parse(filter))) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `${EMPLOYMENT_EXPORT_HREF}?${text}` : EMPLOYMENT_EXPORT_HREF;
}

/** Dışa aktarma rotasının yanıt kodları. */
export const EMPLOYMENT_EXPORT_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'VALIDATION_INVALID',
  'RATE_LIMITED',
] as const satisfies readonly ErrorCode[];

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları
// ---------------------------------------------------------------------------------------------

const authErrors = ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED', 'AUTH_NOT_VERIFIED'] as const;
const staffErrors = [...authErrors, 'AUTH_FORBIDDEN'] as const;

export const ADMIN_ACTION_ERRORS = {
  getAdminOverview: [...staffErrors],
  listAdminReports: [...staffErrors, 'VALIDATION_INVALID'],
  getEmploymentReport: [...staffErrors, 'VALIDATION_INVALID'],
  listDictionaryEntries: [...staffErrors, 'VALIDATION_INVALID'],
  createDictionaryEntry: [
    ...staffErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'DICTIONARY_ENTRY_EXISTS',
  ],
  updateDictionaryEntry: [
    ...staffErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'DICTIONARY_ENTRY_EXISTS',
  ],
  deleteDictionaryEntry: [...staffErrors, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  listUnmatchedValues: [...staffErrors, 'VALIDATION_INVALID'],
  resolveUnmatchedValue: [
    ...staffErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'UNMATCHED_NOT_OPEN',
    'DICTIONARY_ENTRY_EXISTS',
  ],
  listAuditLog: [...staffErrors, 'VALIDATION_INVALID'],
} as const satisfies Record<string, readonly ErrorCode[]>;
