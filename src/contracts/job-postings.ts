import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { adminId, adminPageInput, adminReason } from './admin';
import { sendContactRequestSchema } from './contact-request';
import { CONTACT_FIELDS } from './privacy';

/**
 * Mezun staj/iş ilanları sözleşmesi (P2-04; docs/faz2-plan.md, D19). Servis (W1) ve ekranlar (W2/R1) paylaşır; DEĞİŞTİRMEZLER
 * (değişiklik `ORTAK DOSYA İSTEĞİ`).
 *
 * Akış: yazar (doğrulanmış etkin üyelikli MEZUN ya da AKADEMİSYEN; öğrenci yazamaz) taslak kaydeder → gönderir (`PENDING`; hız
 * sınırı: 30 günde 5 gönderim) → moderatör (yazarın yazım anındaki bölümünün kapsamı) yayımlar ya da gerekçeyle reddeder
 * (deneyim moderasyonuyla aynı kalıp: `MODERATION_PUBLISH`/`MODERATION_REJECT`, hedef `JOB_POSTING`, işlem kaydı aynı işlemde) →
 * `PUBLISHED` ilan son başvuru günü geçince kendiliğinden `EXPIRED` olur (`postings.expire`, İstanbul takvimi). Yazar `PENDING`
 * ya da `PUBLISHED` ilanını `CLOSED` yapabilir; moderatör şikâyet kararıyla kaldırabilir.
 *
 * Kurallar (sunucuda zorlanır; veritabanı CHECK'leri aynı sınırı ayrıca uygular):
 *  - Son başvuru tarihi ZORUNLU, bugünden önce olamaz ve yayın gününden (İstanbul) en çok 60 gün sonrasıdır
 *    (`JOB_POSTING_DEADLINE_INVALID`). Gün sonuna kadar (dahil) açıktır.
 *  - Başvuru yolu platform dışındadır: yalnız `https` bağlantısı (`URL`) ya da yazara iletişim talebi (`CONTACT_REQUEST`, D7).
 *    `javascript:`, `data:`, `http:`, kimlik bilgili ve uygunsuz bağlantı `JOB_POSTING_URL_INVALID`.
 *  - Görünürlük K-07: yayınlanmış ilan, yazar bölümünün üniversitesindeki doğrulanmış etkin üyelere açıktır. Hedef bölümler
 *    (en çok 10, hepsi yazarın üniversitesinden) süzgeç ve eşleştirme içindir (P2-05).
 *  - Okuyucu çıktısında yazarın ADI, e-postası ve telefonu yoktur: yalnız rol türü (`authorKind`). `CONTACT_REQUEST` ilanında
 *    iletişim talebi bağlantısı için `contactUserId` döner (D7); diğer ilanlarda yazar kimliği hiçbir okuyucu çıktısına girmez.
 *    Moderatör kuyruğunda yazarın görünen adı vardır (karar için; kapsamlı yönetici, rıza kapısından geçmiş).
 *  - Puan (P1-16): yayında yazara `JOB_POSTING_PUBLISHED` (5 puan, 7 gün gecikmeli, ayda en çok 3 ilan puan getirir); yayın
 *    kesinleşmeden geri çekilir/kaldırılırsa geri alınır.
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;
const URL_INVALID = 'JOB_POSTING_URL_INVALID' satisfies ErrorCode;
const DEADLINE_INVALID = 'JOB_POSTING_DEADLINE_INVALID' satisfies ErrorCode;

// ---------------------------------------------------------------------------------------------
// Katalog ve sınırlar
// ---------------------------------------------------------------------------------------------

export const JOB_POSTING_KINDS = ['INTERNSHIP', 'JOB'] as const;
export type JobPostingKind = (typeof JOB_POSTING_KINDS)[number];
export const JOB_POSTING_STATUSES = [
  'DRAFT',
  'PENDING',
  'PUBLISHED',
  'REJECTED',
  'EXPIRED',
  'CLOSED',
] as const;
export type JobPostingStatus = (typeof JOB_POSTING_STATUSES)[number];
export const JOB_APPLY_METHODS = ['URL', 'CONTACT_REQUEST'] as const;
export type JobApplyMethod = (typeof JOB_APPLY_METHODS)[number];
/** Yazar rolleri: ilanı yalnız doğrulanmış etkin üyelikli mezun ya da akademisyen yazar. */
export const JOB_POSTING_AUTHOR_ROLES = ['ALUMNI', 'ACADEMIC'] as const;
export type JobPostingAuthorRole = (typeof JOB_POSTING_AUTHOR_ROLES)[number];

export const JOB_POSTING_TITLE_MIN = 3;
export const JOB_POSTING_TITLE_MAX = 120;
export const JOB_POSTING_ORGANIZATION_MIN = 2;
export const JOB_POSTING_ORGANIZATION_MAX = 120;
export const JOB_POSTING_LOCATION_MIN = 2;
export const JOB_POSTING_LOCATION_MAX = 100;
export const JOB_POSTING_DESCRIPTION_MIN = 30;
export const JOB_POSTING_DESCRIPTION_MAX = 3000;
export const JOB_POSTING_URL_MAX = 500;
export const JOB_POSTING_TARGETS_MAX = 10;
/** Son başvuru günü, yayın gününden (İstanbul) en çok bu kadar gün sonradır. */
export const JOB_POSTING_MAX_DAYS = 60;
/** Gönderim hız sınırı: yazar başına 30 günlük pencerede en çok bu kadar gönderim. */
export const JOB_POSTING_SUBMIT_LIMIT = 5;
export const JOB_POSTING_SUBMIT_WINDOW_DAYS = 30;
/** Puan: yazar başına bir İstanbul takvim ayında bu kadar ilan puan getirir (fazlası çarpan 0). */
export const JOB_POSTING_POINTS_PER_MONTH = 3;
export const JOB_POSTING_REPORT_RATE_LIMIT = { maxRequests: 10, windowSeconds: 24 * 60 * 60 };
export const JOB_POSTING_PAGE_SIZE_DEFAULT = 20;
export const JOB_POSTING_PAGE_SIZE_MAX = 50;
export const JOB_POSTING_SEARCH_MIN = 2;
export const JOB_POSTING_SEARCH_MAX = 100;

/** Ekran bağlantıları (ekran adımı bunları kurar). */
export const JOB_POSTINGS_HREF = '/ilanlar';
export const MY_JOB_POSTINGS_HREF = '/ilanlarim';

// ---------------------------------------------------------------------------------------------
// Alan doğrulayıcıları
// ---------------------------------------------------------------------------------------------

const text = (min: number, max: number) =>
  z.string({ error: INVALID }).trim().min(min, { error: INVALID }).max(max, { error: INVALID });
const postingId = adminId;
const deptId = adminId;

/**
 * Başvuru bağlantısını doğrular ve normalleştirir (saf): yalnız `https:`, kimlik bilgisi (`user:pass@`) yok, sunucu adı en az bir
 * nokta içerir (yerel/iç adres yok), boşluk/kontrol karakteri yok, ≤ 500 karakter. Geçersizse `null`.
 */
export function parseApplyUrl(value: string): string | null {
  const raw = value.trim();
  if (raw.length === 0 || raw.length > JOB_POSTING_URL_MAX) return null;
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.local')) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  return url.href.length <= JOB_POSTING_URL_MAX ? url.href : null;
}

const applyUrl = z
  .string({ error: URL_INVALID })
  .trim()
  .refine((value) => parseApplyUrl(value) !== null, { error: URL_INVALID })
  .transform((value) => parseApplyUrl(value) as string);

/** Takvim günü `YYYY-MM-DD` (İstanbul günü; saat dilimi yok). Gerçek bir tarih olmalıdır. */
const isoDay = z
  .string({ error: DEADLINE_INVALID })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: DEADLINE_INVALID })
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    },
    { error: DEADLINE_INVALID },
  );

const targetIds = z.array(deptId).max(JOB_POSTING_TARGETS_MAX, { error: INVALID });
const tagIds = z
  .array(adminId)
  .max(5, { error: INVALID })
  .refine((v) => new Set(v).size === v.length, { error: INVALID });
const targetGrades = z
  .array(z.number().int().min(1).max(4))
  .max(4, { error: INVALID })
  .refine((v) => new Set(v).size === v.length, { error: INVALID });

// ---------------------------------------------------------------------------------------------
// Yazar: form bağlamı, taslak, gönder, kapat, ilanlarım
// ---------------------------------------------------------------------------------------------

export const getJobPostingFormContextSchema = z.object({}).strict();
export type GetJobPostingFormContextInput = z.input<typeof getJobPostingFormContextSchema>;
/** Form bağlamı: yazarın üyelik bölümleri (kapsam seçimi) ve hedef olabilecek bölümler (aynı üniversite). */
export const jobPostingFormContextSchema = z
  .object({
    authorDepartments: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    availableTags: z.array(
      z.object({ id: z.string(), slug: z.string(), label: z.string().nullable() }).strict(),
    ),
    targetDepartments: z.array(
      z.object({ id: z.string(), name: z.string(), facultyName: z.string() }).strict(),
    ),
    limits: z
      .object({
        maxDays: z.literal(JOB_POSTING_MAX_DAYS),
        submitLimit: z.literal(JOB_POSTING_SUBMIT_LIMIT),
        submitWindowDays: z.literal(JOB_POSTING_SUBMIT_WINDOW_DAYS),
        maxTargets: z.literal(JOB_POSTING_TARGETS_MAX),
      })
      .strict(),
  })
  .strict();
export type JobPostingFormContext = z.infer<typeof jobPostingFormContextSchema>;

/**
 * TAMAMLANMIŞ içerik (gönderimde sunucunun saklanan taslağa uyguladığı şema). `organizationName` zorunludur; `companyId`
 * sözlük bağlantısıdır (seçilirse kurum adı sözlükteki adla eşitlenir). Konum ya da uzaktan (ya da ikisi) bulunmalıdır.
 */
export const jobPostingContentSchema = z
  .object({
    kind: z.enum(JOB_POSTING_KINDS, { error: INVALID }),
    title: text(JOB_POSTING_TITLE_MIN, JOB_POSTING_TITLE_MAX),
    organizationName: text(JOB_POSTING_ORGANIZATION_MIN, JOB_POSTING_ORGANIZATION_MAX),
    companyId: adminId.nullable().optional(),
    location: text(JOB_POSTING_LOCATION_MIN, JOB_POSTING_LOCATION_MAX).nullable().optional(),
    isRemote: z.boolean({ error: INVALID }),
    description: text(JOB_POSTING_DESCRIPTION_MIN, JOB_POSTING_DESCRIPTION_MAX),
    applyMethod: z.enum(JOB_APPLY_METHODS, { error: INVALID }),
    applyUrl: applyUrl.nullable().optional(),
    deadlineOn: isoDay,
    targetDepartmentIds: targetIds.min(1, { error: INVALID }),
    tagIds: tagIds.optional(),
    targetGrades: targetGrades.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.location && !value.isRemote)
      context.addIssue({ code: 'custom', path: ['location'], message: INVALID });
    if (value.applyMethod === 'URL' && !value.applyUrl)
      context.addIssue({ code: 'custom', path: ['applyUrl'], message: URL_INVALID });
    if (value.applyMethod === 'CONTACT_REQUEST' && value.applyUrl)
      context.addIssue({ code: 'custom', path: ['applyUrl'], message: URL_INVALID });
  });
export type JobPostingContent = z.infer<typeof jobPostingContentSchema>;

/**
 * Taslak içeriği: her alan isteğe bağlıdır ve boş metin "yok" sayılır; VAR olan değer en çok sınırı geçemez (en az sınırı gönderimde
 * aranır). Bağlantı varsa https olmalıdır.
 */
const draftText = (max: number) =>
  z
    .string({ error: INVALID })
    .trim()
    .max(max, { error: INVALID })
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
export const jobPostingDraftContentSchema = z
  .object({
    kind: z.enum(JOB_POSTING_KINDS, { error: INVALID }).optional(),
    title: draftText(JOB_POSTING_TITLE_MAX),
    organizationName: draftText(JOB_POSTING_ORGANIZATION_MAX),
    companyId: adminId.nullable().optional(),
    location: draftText(JOB_POSTING_LOCATION_MAX),
    isRemote: z.boolean({ error: INVALID }).optional(),
    description: draftText(JOB_POSTING_DESCRIPTION_MAX),
    applyMethod: z.enum(JOB_APPLY_METHODS, { error: INVALID }).nullable().optional(),
    // Boş metin "yok" sayılır; dolu değer https bağlantısı olmalı (hata kodu `JOB_POSTING_URL_INVALID`).
    applyUrl: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
      applyUrl.nullable().optional(),
    ),
    deadlineOn: isoDay.nullable().optional(),
    targetDepartmentIds: targetIds.optional(),
    tagIds: tagIds.optional(),
    targetGrades: targetGrades.optional(),
  })
  .strict();
export type JobPostingDraftContent = z.infer<typeof jobPostingDraftContentSchema>;

/**
 * Taslağı kaydeder (yeni ya da mevcut). `departmentId`: yazarın doğrulanmış etkin üyeliklerinden biri (MODERASYON KAPSAMI; yazım
 * anında sabitlenir, sonradan rol/bölüm değişimi kapsamı değiştirmez). `DRAFT` ve `REJECTED` düzenlenir (reddedilmiş ilan
 * düzenlenince `DRAFT` olur, ret gerekçesi temizlenir); diğer durumda `JOB_POSTING_NOT_EDITABLE`.
 */
export const saveJobPostingDraftSchema = z
  .object({
    postingId: postingId.optional(),
    departmentId: deptId,
    content: jobPostingDraftContentSchema,
  })
  .strict();
export type SaveJobPostingDraftInput = z.input<typeof saveJobPostingDraftSchema>;

export const jobPostingIdSchema = z.object({ postingId }).strict();
export type JobPostingIdInput = z.input<typeof jobPostingIdSchema>;

const targetDepartmentSchema = z.object({ id: z.string(), name: z.string() }).strict();

/** Yazarın kendi ilanı (içerik tam; durum, ret gerekçesi ve zamanlar). */
export const myJobPostingViewSchema = z
  .object({
    id: z.string(),
    status: z.enum(JOB_POSTING_STATUSES),
    kind: z.enum(JOB_POSTING_KINDS),
    title: z.string().nullable(),
    organizationName: z.string().nullable(),
    companyId: z.string().nullable(),
    location: z.string().nullable(),
    isRemote: z.boolean(),
    description: z.string().nullable(),
    applyMethod: z.enum(JOB_APPLY_METHODS).nullable(),
    applyUrl: z.string().nullable(),
    deadlineOn: z.string().nullable(),
    departmentId: z.string(),
    targetDepartments: z.array(targetDepartmentSchema),
    tagIds: z.array(z.string()),
    targetGrades: z.array(z.number()),
    matchReach: z
      .union([
        z.object({ belowThreshold: z.literal(true), count: z.null() }),
        z.object({ belowThreshold: z.literal(false), count: z.number().int().min(3) }),
      ])
      .optional(),
    /** `REJECTED`: moderatörün gerekçesi (yazara gösterilir); diğer durumlarda `null`. */
    moderationNote: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
    submittedAt: z.date().nullable(),
    publishedAt: z.date().nullable(),
    endedAt: z.date().nullable(),
  })
  .strict();
export type MyJobPostingView = z.infer<typeof myJobPostingViewSchema>;

export const submitJobPostingOutputSchema = z
  .object({ postingId: z.string(), status: z.literal('PENDING') })
  .strict();
export type SubmitJobPostingOutput = z.infer<typeof submitJobPostingOutputSchema>;

/** Yazar kendi ilanını çeker: yalnız `PENDING`/`PUBLISHED` (kesinleşmemiş puan geri alınır). Taslak ve diğer durumda `JOB_POSTING_NOT_OPEN`. */
export const closeJobPostingOutputSchema = z
  .object({ postingId: z.string(), status: z.literal('CLOSED') })
  .strict();
export type CloseJobPostingOutput = z.infer<typeof closeJobPostingOutputSchema>;

export const listMyJobPostingsSchema = z
  .object({
    status: z.enum(JOB_POSTING_STATUSES, { error: INVALID }).optional(),
    cursor: adminPageInput.cursor,
    limit: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1, { error: INVALID })
      .max(JOB_POSTING_PAGE_SIZE_MAX, { error: INVALID })
      .default(JOB_POSTING_PAGE_SIZE_DEFAULT),
  })
  .strict();
export type ListMyJobPostingsInput = z.input<typeof listMyJobPostingsSchema>;
export const myJobPostingPageSchema = z
  .object({ items: z.array(myJobPostingViewSchema), nextCursor: z.string().nullable() })
  .strict();
export type MyJobPostingPage = z.infer<typeof myJobPostingPageSchema>;

// ---------------------------------------------------------------------------------------------
// Doğrulanmış üye: arama/liste ve detay (K-07)
// ---------------------------------------------------------------------------------------------

export const searchJobPostingsSchema = z
  .object({
    /** Serbest metin (Türkçe tam metin + yazım hatası toleransı); yoksa en yeni/yaklaşan. Sorgu metni loglanmaz. */
    q: text(JOB_POSTING_SEARCH_MIN, JOB_POSTING_SEARCH_MAX).optional(),
    departmentId: deptId.optional(),
    kind: z.enum(JOB_POSTING_KINDS, { error: INVALID }).optional(),
    /** Sözlük şirketi. `organizationName` ile BİRLİKTE gönderilemez (ya biri ya öteki; `VALIDATION_INVALID`). */
    companyId: adminId.optional(),
    /**
     * Sözlüğe bağlı OLMAYAN (serbest adlı) kurum: tam eşleşme, tr-TR küçük harf + ASCII katlama ("Örnek Teknoloji" = "ORNEK TEKNOLOJI").
     * Süzgeç seçeneklerinde `companyId` boş olan kurum satırının `name` değeridir.
     */
    organizationName: text(JOB_POSTING_ORGANIZATION_MIN, JOB_POSTING_ORGANIZATION_MAX).optional(),
    /** Konum metni (içerir; tr-TR küçük harf + ASCII katlama: "İstanbul" = "istanbul" = "ISTANBUL"). */
    location: text(JOB_POSTING_LOCATION_MIN, JOB_POSTING_LOCATION_MAX).optional(),
    remote: z.boolean({ error: INVALID }).optional(),
    /** Son başvuruya en çok bu kadar gün kalanlar ("son günler"). */
    withinDays: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(0, { error: INVALID })
      .max(JOB_POSTING_MAX_DAYS, { error: INVALID })
      .optional(),
    page: z.number({ error: INVALID }).int({ error: INVALID }).min(1).max(200).default(1),
    pageSize: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1)
      .max(JOB_POSTING_PAGE_SIZE_MAX)
      .default(JOB_POSTING_PAGE_SIZE_DEFAULT),
  })
  .strict()
  .refine((value) => !(value.companyId && value.organizationName), {
    error: INVALID,
    path: ['organizationName'],
  });
export type SearchJobPostingsInput = z.input<typeof searchJobPostingsSchema>;

/** Okuyucu kartı: yazar adı/kimliği YOK (yalnız rol türü). `daysLeft`: bugünden (İstanbul) son güne kalan gün (0 = bugün son gün). */
export const jobPostingCardSchema = z
  .object({
    id: z.string(),
    kind: z.enum(JOB_POSTING_KINDS),
    title: z.string(),
    organizationName: z.string(),
    companyId: z.string().nullable(),
    location: z.string().nullable(),
    isRemote: z.boolean(),
    deadlineOn: z.string(),
    daysLeft: z.number().int().min(0),
    applyMethod: z.enum(JOB_APPLY_METHODS),
    publishedAt: z.date(),
    authorKind: z.enum(JOB_POSTING_AUTHOR_ROLES),
    matchTags: z.array(z.object({ slug: z.string(), label: z.string().nullable() })).optional(),
    targetDepartments: z.array(targetDepartmentSchema),
  })
  .strict();
export type JobPostingCard = z.infer<typeof jobPostingCardSchema>;
export const jobPostingPageSchema = z
  .object({
    items: z.array(jobPostingCardSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  })
  .strict();
export type JobPostingPage = z.infer<typeof jobPostingPageSchema>;

/**
 * Süzgeç seçenekleri (ekran açılır listeleri için): arayanın üniversitesindeki YAYINDA ve süresi dolmamış ilanlarda geçen kurumlar,
 * hedef bölümler ve konumlar (K-07 kapsamı; ilan sayısıyla). Kişi verisi yoktur. Liste uzunlukları sınırlıdır (en çok sayıdan başlar).
 */
export const JOB_POSTING_FILTER_OPTIONS_LIMIT = 100;
export const getJobPostingFilterOptionsSchema = z.object({}).strict();
export type GetJobPostingFilterOptionsInput = z.input<typeof getJobPostingFilterOptionsSchema>;
export const jobPostingFilterOptionsSchema = z
  .object({
    organizations: z
      .array(
        z
          .object({
            /** Satırı tekil tanıtır: `companyId` varsa o, yoksa kurum adı (liste anahtarı olarak kullanılır). */
            key: z.string(),
            companyId: z.string().nullable(),
            name: z.string(),
            count: z.number().int().min(1),
          })
          .strict(),
      )
      .max(JOB_POSTING_FILTER_OPTIONS_LIMIT),
    departments: z
      .array(
        z.object({ id: z.string(), name: z.string(), count: z.number().int().min(1) }).strict(),
      )
      .max(JOB_POSTING_FILTER_OPTIONS_LIMIT),
    locations: z
      .array(z.object({ name: z.string(), count: z.number().int().min(1) }).strict())
      .max(JOB_POSTING_FILTER_OPTIONS_LIMIT),
    /** Uzaktan çalışılabilen ilan sayısı ("Uzaktan" süzgeci için). */
    remoteCount: z.number().int().min(0),
  })
  .strict();
export type JobPostingFilterOptions = z.infer<typeof jobPostingFilterOptionsSchema>;

export const getJobPostingSchema = z.object({ id: postingId }).strict();
export type GetJobPostingInput = z.input<typeof getJobPostingSchema>;
/**
 * Okuyucu detayı: kart + açıklama. `applyUrl` YALNIZ `URL` yönteminde döner. `CONTACT_REQUEST` yönteminde yazar kimliği HİÇBİR okuyucu
 * çıktısında yoktur (D7: `/iletisim-iste` önizlemesi ad döndürür; ad yalnız talep onaylanınca açılır): iletişim talebi İLAN ÜZERİNDEN
 * (`previewJobPostingContact`/`requestJobPostingContact`, girdi `jobPostingId`) gönderilir ve sunucu yazarı çözer.
 */
export const jobPostingDetailSchema = jobPostingCardSchema
  .extend({
    description: z.string(),
    applyUrl: z.string().nullable(),
  })
  .strict();
export type JobPostingDetail = z.infer<typeof jobPostingDetailSchema>;

// ---------------------------------------------------------------------------------------------
// İlan üzerinden iletişim talebi (D7): yazar kimliği/adı okuyucuya HİÇ gitmez
// ---------------------------------------------------------------------------------------------

/**
 * Önizleme: girdi ilan kimliği; çıktıda ilan başlığı ve kurum (ad/kimlik yok) ile yazarın onayla açılabilecek alanları (en az bir).
 * Talep edilemeyen her durum (ilan yok/kapsam dışı/açık değil, `CONTACT_REQUEST` yöntemi değil, kendi ilanı, yazar askıda/silinmiş,
 * alan yok) TEK genel yanıta düşer; ayrım yalnız sunucudadır. Hız sınırlı (kimlik/ilan taraması yavaşlar).
 */
export const previewJobPostingContactSchema = z.object({ jobPostingId: postingId }).strict();
export type PreviewJobPostingContactInput = z.input<typeof previewJobPostingContactSchema>;
export const jobPostingContactPreviewSchema = z.discriminatedUnion('canRequest', [
  z
    .object({
      canRequest: z.literal(true),
      postingTitle: z.string(),
      organizationName: z.string(),
      requestableFields: z.array(z.enum(CONTACT_FIELDS)).min(1),
    })
    .strict(),
  z
    .object({
      canRequest: z.literal(false),
      postingTitle: z.null(),
      organizationName: z.null(),
      requestableFields: z.array(z.enum(CONTACT_FIELDS)).length(0),
    })
    .strict(),
]);
export type JobPostingContactPreview = z.infer<typeof jobPostingContactPreviewSchema>;
export const JOB_POSTING_CONTACT_NOT_REQUESTABLE: JobPostingContactPreview = {
  canRequest: false,
  postingTitle: null,
  organizationName: null,
  requestableFields: [],
};

/**
 * Yazara iletişim talebi (mevcut `ContactRequest` kaydı ve bildirimi; hedef sunucuda ilandan çözülür). `message` en çok 500
 * karakter; talebe ilan başlığı bağlamı sunucuca eklenir. Yazarın ADI/kimliği çıktıda yoktur.
 */
export const requestJobPostingContactSchema = z
  .object({
    jobPostingId: postingId,
    fields: sendContactRequestSchema.shape.fields,
    message: sendContactRequestSchema.shape.message,
  })
  .strict();
export type RequestJobPostingContactInput = z.input<typeof requestJobPostingContactSchema>;
export const requestJobPostingContactOutputSchema = z
  .object({ requestId: z.string(), status: z.literal('PENDING') })
  .strict();
export type RequestJobPostingContactOutput = z.infer<typeof requestJobPostingContactOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Moderatör: kuyruk, karar
// ---------------------------------------------------------------------------------------------

export const listJobPostingModerationQueueSchema = z
  .object({ departmentId: deptId.optional(), ...adminPageInput })
  .strict();
export type ListJobPostingModerationQueueInput = z.input<
  typeof listJobPostingModerationQueueSchema
>;
/** Kuyruk kaydı: tam içerik + yazarın görünen adı ve rolü (karar için; e-posta/telefon yok). */
export const jobPostingModerationItemSchema = myJobPostingViewSchema
  .extend({
    author: z
      .object({ displayName: z.string(), role: z.enum(JOB_POSTING_AUTHOR_ROLES).nullable() })
      .strict(),
  })
  .strict();
export type JobPostingModerationItem = z.infer<typeof jobPostingModerationItemSchema>;
export const jobPostingModerationPageSchema = z
  .object({ items: z.array(jobPostingModerationItemSchema), nextCursor: z.string().nullable() })
  .strict();
export type JobPostingModerationPage = z.infer<typeof jobPostingModerationPageSchema>;

/** Yayımla: ret gerekçesi yoktur. Reddet: gerekçe zorunlu (yazara gösterilir; kişisel veri içeremez). */
export const reviewJobPostingSchema = z.discriminatedUnion(
  'decision',
  [
    z.object({ postingId, decision: z.literal('PUBLISH') }).strict(),
    z.object({ postingId, decision: z.literal('REJECT'), reason: adminReason }).strict(),
  ],
  { error: INVALID },
);
export type ReviewJobPostingInput = z.input<typeof reviewJobPostingSchema>;
export const reviewJobPostingOutputSchema = z
  .object({ postingId: z.string(), status: z.enum(['PUBLISHED', 'REJECTED']) })
  .strict();
export type ReviewJobPostingOutput = z.infer<typeof reviewJobPostingOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Şikâyet (raportör kimliği hiçbir çıktıda yoktur)
// ---------------------------------------------------------------------------------------------

export const reportJobPostingSchema = z.object({ postingId, reason: adminReason }).strict();
export type ReportJobPostingInput = z.input<typeof reportJobPostingSchema>;
export const reportJobPostingOutputSchema = z
  .object({ reportId: z.string(), status: z.literal('OPEN') })
  .strict();
export type ReportJobPostingOutput = z.infer<typeof reportJobPostingOutputSchema>;

export const listJobPostingReportsSchema = z
  .object({
    status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED'], { error: INVALID }).default('OPEN'),
    departmentId: deptId.optional(),
    ...adminPageInput,
  })
  .strict();
export type ListJobPostingReportsInput = z.input<typeof listJobPostingReportsSchema>;
export const jobPostingReportSchema = z
  .object({
    id: z.string(),
    postingId: z.string(),
    postingTitle: z.string().nullable(),
    postingStatus: z.enum(JOB_POSTING_STATUSES),
    reason: z.string(),
    status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']),
    createdAt: z.date(),
    reviewedAt: z.date().nullable(),
    resolutionNote: z.string().nullable(),
  })
  .strict();
export type JobPostingReport = z.infer<typeof jobPostingReportSchema>;
export const jobPostingReportPageSchema = z
  .object({ items: z.array(jobPostingReportSchema), nextCursor: z.string().nullable() })
  .strict();
export type JobPostingReportPage = z.infer<typeof jobPostingReportPageSchema>;

/**
 * Şikâyeti sonuçlandırır. `DISMISS`: ilan yerinde kalır. `TAKE_DOWN`: ilan `CLOSED` olur (kesinleşmemiş puan geri alınır) ve şikâyet
 * `RESOLVED` kapanır. Gerekçe zorunludur; işlem kaydı (`REPORT_RESOLVE`) aynı işlemde yazılır.
 */
export const resolveJobPostingReportSchema = z
  .object({
    reportId: adminId,
    decision: z.enum(['DISMISS', 'TAKE_DOWN'], { error: INVALID }),
    reason: adminReason,
  })
  .strict();
export type ResolveJobPostingReportInput = z.input<typeof resolveJobPostingReportSchema>;
export const resolveJobPostingReportOutputSchema = z
  .object({ reportId: z.string(), status: z.enum(['RESOLVED', 'DISMISSED']) })
  .strict();
export type ResolveJobPostingReportOutput = z.infer<typeof resolveJobPostingReportOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları ve erişim
// ---------------------------------------------------------------------------------------------

/** Erişim: `AUTHOR` doğrulanmış etkin üyelikli mezun/akademisyen; `MODERATOR` kapsamlı yönetici; `VERIFIED_MEMBER` doğrulanmış üye. */
export const JOB_POSTING_ACTION_ACCESS = {
  getJobPostingFormContext: 'AUTHOR',
  saveJobPostingDraft: 'AUTHOR',
  submitJobPosting: 'AUTHOR',
  closeJobPosting: 'AUTHOR',
  listMyJobPostings: 'AUTHOR',
  searchJobPostings: 'VERIFIED_MEMBER',
  getJobPostingFilterOptions: 'VERIFIED_MEMBER',
  getJobPosting: 'VERIFIED_MEMBER',
  reportJobPosting: 'VERIFIED_MEMBER',
  previewJobPostingContact: 'VERIFIED_MEMBER',
  requestJobPostingContact: 'VERIFIED_MEMBER',
  listJobPostingModerationQueue: 'MODERATOR',
  reviewJobPosting: 'MODERATOR',
  listJobPostingReports: 'MODERATOR',
  resolveJobPostingReport: 'MODERATOR',
} as const satisfies Record<string, 'AUTHOR' | 'MODERATOR' | 'VERIFIED_MEMBER'>;
export type JobPostingActionName = keyof typeof JOB_POSTING_ACTION_ACCESS;

const AUTH_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'CONSENT_REQUIRED',
] as const satisfies readonly ErrorCode[];

export const JOB_POSTING_ACTION_ERRORS = {
  getJobPostingFormContext: [...AUTH_ERRORS],
  saveJobPostingDraft: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'JOB_POSTING_NOT_EDITABLE',
    'JOB_POSTING_URL_INVALID',
    'JOB_POSTING_DEADLINE_INVALID',
    'JOB_POSTING_TARGET_INVALID',
  ],
  submitJobPosting: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'RATE_LIMITED',
    'JOB_POSTING_NOT_DRAFT',
    'JOB_POSTING_INCOMPLETE',
    'JOB_POSTING_URL_INVALID',
    'JOB_POSTING_DEADLINE_INVALID',
    'JOB_POSTING_TARGET_INVALID',
  ],
  closeJobPosting: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'JOB_POSTING_NOT_OPEN',
  ],
  listMyJobPostings: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  searchJobPostings: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  getJobPostingFilterOptions: [...AUTH_ERRORS],
  getJobPosting: [...AUTH_ERRORS, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  reportJobPosting: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'RATE_LIMITED',
    'JOB_POSTING_NOT_OPEN',
    'REPORT_ALREADY_OPEN',
  ],
  previewJobPostingContact: [...AUTH_ERRORS, 'VALIDATION_INVALID', 'RATE_LIMITED'],
  requestJobPostingContact: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'RATE_LIMITED',
    'CONTACT_REQUEST_SELF',
    'CONTACT_REQUEST_ALREADY_OPEN',
    'CONTACT_FIELD_NOT_REQUESTABLE',
  ],
  listJobPostingModerationQueue: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  reviewJobPosting: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'AUDIT_REASON_REQUIRED',
    'AUDIT_REASON_INVALID',
    'RESOURCE_NOT_FOUND',
    'JOB_POSTING_NOT_PENDING',
    'JOB_POSTING_DEADLINE_INVALID',
  ],
  listJobPostingReports: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  resolveJobPostingReport: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'AUDIT_REASON_REQUIRED',
    'AUDIT_REASON_INVALID',
    'RESOURCE_NOT_FOUND',
    'REPORT_NOT_OPEN',
  ],
} as const satisfies Record<JobPostingActionName, readonly ErrorCode[]>;
