import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { REPORT_MIN_GROUP_SIZE } from './admin';
import { EXPERIENCE_TYPES } from './experience';

/**
 * Kullanım metrikleri sözleşmesi (P1-13; docs/architecture.md "Kullanım metrikleri"). Kendi `Event` tablomuz; üçüncü
 * taraf analitik yok. Servis (W1) ve panel ekranı (W2) paylaşır; DEĞİŞTİRMEZLER (değişiklik `ORTAK DOSYA İSTEĞİ`).
 *
 * İlkeler:
 *  - `props` KİŞİSEL VERİ taşımaz: her olay türünün şeması `strict`tir ve yalnız sabit değerler (enum, sayı, mantıksal)
 *    içerir; serbest metin alanı yoktur. Veritabanı CHECK'i ek ağdır (e-posta/uzun rakam dizisi reddedilir).
 *  - Olay yazımı istek yolunu yavaşlatmaz ve hatası kullanıcı akışını bozmaz (`emitEvent` sessizdir).
 *  - Olay, kullanıcının O ANKİ rolünü ve bölümünü saklar (rol sonradan değişse de geçmiş sayı değişmez).
 *  - `Event.userId` 24 ay sonra (ve hesap silmede hemen) koparılır (`null`); sayılar kalır.
 *  - Panel sorguları yöneticinin kapsamıyla kesişir; `departmentId`/`facultyId` süzgeçleri YETKİ VERMEZ. Kapsam dışı
 *    bölümün olayı hiçbir yanıtta yoktur. Sistem yöneticisi bölümsüz olayları da görür.
 *  - Küçük hücre bastırma: ayrı kullanıcı sayısı `REPORT_MIN_GROUP_SIZE`'ın altındaki (rol × bölüm) hücreler tek tek
 *    gösterilmez; `OTHER` hücresinde birleşir, o da eşiğin altındaysa hiç gösterilmez. Excel de aynı kuralı kullanır.
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

export const EVENT_TYPES = [
  'LOGIN',
  'PROFILE_THRESHOLD',
  'CV_UPLOADED',
  'CV_APPLIED',
  'EXPERIENCE_PUBLISHED',
  'SEARCH',
  'MENTOR_SEARCH',
  'MENTOR_VIEWED',
  'APPOINTMENT_REQUESTED',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_COMPLETED',
  'FAQ_REQUESTED',
  'FAQ_PUBLISHED',
  'CV_REVIEW_REQUESTED',
  'CONTACT_REQUESTED',
  'JOB_POSTING_PUBLISHED',
  'JOB_POSTING_VIEWED',
  'JOB_POSTING_SEARCH',
  'JOB_SEEKER_SEARCH',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_ROLES = ['STUDENT', 'ALUMNI', 'ACADEMIC'] as const;
/** Olay `Event.createdAt`'ten 24 ay sonra kullanıcıdan koparılır. */
export const EVENT_RETENTION_MONTHS = 24;
/** Profil eşikleri; her eşik kullanıcı başına 24 aylık pencerede bir kez yazılır. */
export const PROFILE_THRESHOLDS = [50, 80, 100] as const;

/** Arama olaylarına yalnız hangi süzgeç TÜRÜ kullanıldığı girer; süzgeç değeri ve sorgu metni asla. */
export const SEARCH_FILTER_KEYS = [
  'q',
  'types',
  'company',
  'channels',
  'sectorId',
  'termYear',
  'termSeason',
  'pay',
] as const;
export const MENTOR_FILTER_KEYS = [
  'mentorTypes',
  'sectorId',
  'company',
  'title',
  'skill',
  'experienceTypes',
  'meetingModes',
  'onlyAvailable',
] as const;
export const RESULT_BUCKETS = ['NONE', 'FEW', 'MANY'] as const;
export const resultBucketOf = (count: number): (typeof RESULT_BUCKETS)[number] =>
  count <= 0 ? 'NONE' : count <= 5 ? 'FEW' : 'MANY';

const meetingMode = z.enum(['ONLINE', 'IN_PERSON']);
const filterKeys = <T extends readonly [string, ...string[]]>(keys: T) =>
  z
    .array(z.enum(keys))
    .max(keys.length)
    .refine((list) => new Set(list).size === list.length);

/** Olay türü başına `props` şeması. Hepsi `strict`: tanımsız alan (e-posta, ad, telefon, metin) reddedilir. */
export const EVENT_PROPS_SCHEMAS = {
  LOGIN: z.object({ method: z.enum(['EMAIL_LINK', 'LINKEDIN']) }).strict(),
  PROFILE_THRESHOLD: z
    .object({ threshold: z.union([z.literal(50), z.literal(80), z.literal(100)]) })
    .strict(),
  CV_UPLOADED: z.object({}).strict(),
  CV_APPLIED: z
    .object({
      created: z.number().int().min(0).max(1000),
      updated: z.number().int().min(0).max(1000),
    })
    .strict(),
  EXPERIENCE_PUBLISHED: z
    .object({ experienceType: z.enum(EXPERIENCE_TYPES), anonymous: z.boolean() })
    .strict(),
  SEARCH: z
    .object({ filters: filterKeys(SEARCH_FILTER_KEYS), results: z.enum(RESULT_BUCKETS) })
    .strict(),
  MENTOR_SEARCH: z
    .object({ filters: filterKeys(MENTOR_FILTER_KEYS), results: z.enum(RESULT_BUCKETS) })
    .strict(),
  MENTOR_VIEWED: z.object({}).strict(),
  APPOINTMENT_REQUESTED: z.object({ mode: meetingMode }).strict(),
  APPOINTMENT_CONFIRMED: z.object({ mode: meetingMode }).strict(),
  APPOINTMENT_COMPLETED: z.object({ mode: meetingMode }).strict(),
  FAQ_REQUESTED: z.object({}).strict(),
  FAQ_PUBLISHED: z.object({}).strict(),
  CV_REVIEW_REQUESTED: z.object({}).strict(),
  CONTACT_REQUESTED: z.object({ fieldCount: z.number().int().min(1).max(4) }).strict(),
  JOB_POSTING_PUBLISHED: z.object({ kind: z.enum(['INTERNSHIP', 'JOB']) }).strict(),
  JOB_POSTING_VIEWED: z.object({}).strict(),
  JOB_POSTING_SEARCH: z.object({ results: z.enum(RESULT_BUCKETS) }).strict(),
  /** Aday araması (P2-06): yalnız sonuç kovası; süzgeç değerleri ve aday kimliği yazılmaz. */
  JOB_SEEKER_SEARCH: z.object({ results: z.enum(RESULT_BUCKETS) }).strict(),
} as const satisfies Record<EventType, z.ZodType>;

export type EventProps<T extends EventType> = z.infer<(typeof EVENT_PROPS_SCHEMAS)[T]>;

/** Sunucu içi olay girdisi: tür + o türün `props`'u. Doğrulanmamış `props` yazılamaz. */
export const eventInputSchema = z.discriminatedUnion(
  'type',
  EVENT_TYPES.map((type) =>
    z.object({ type: z.literal(type), props: EVENT_PROPS_SCHEMAS[type] }).strict(),
  ) as unknown as [z.ZodObject, ...z.ZodObject[]],
);
export type EventInput = {
  [T in EventType]: { type: T; props: EventProps<T> };
}[EventType];

// ---------------------------------------------------------------------------------------------
// Panel sorguları (yalnız yönetici; kapsamla kesişir)
// ---------------------------------------------------------------------------------------------

export const USAGE_RANGE_MAX_DAYS = 366;
const MS_PER_DAY = 86_400_000;

/**
 * Tarih aralığı yarı açıktır: [`from`, `to`). `departmentId` ile `facultyId` birlikte verilemez; ikisi de yoksa yöneticinin
 * bütün kapsamı. Süzgeçler yetki vermez. Aralık en çok 366 gün.
 */
export const usageMetricsFilterSchema = z
  .object({
    from: z.coerce.date({ error: INVALID }),
    to: z.coerce.date({ error: INVALID }),
    departmentId: z.string({ error: INVALID }).trim().min(1).max(64).optional(),
    facultyId: z.string({ error: INVALID }).trim().min(1).max(64).optional(),
    types: z
      .array(z.enum(EVENT_TYPES, { error: INVALID }), { error: INVALID })
      .min(1)
      .max(EVENT_TYPES.length)
      .refine((list) => new Set(list).size === list.length, { error: INVALID })
      .optional(),
  })
  .strict()
  .refine((value) => value.from.getTime() < value.to.getTime(), { error: INVALID, path: ['to'] })
  .refine(
    (value) => value.to.getTime() - value.from.getTime() <= USAGE_RANGE_MAX_DAYS * MS_PER_DAY,
    {
      error: INVALID,
      path: ['to'],
    },
  )
  .refine((value) => !(value.departmentId && value.facultyId), {
    error: INVALID,
    path: ['facultyId'],
  });
export type UsageMetricsFilter = z.input<typeof usageMetricsFilterSchema>;

/**
 * Düz hücre listesi (ekran istediği gibi döndürür). `NAMED`: rol × bölüm × tür; `OTHER`: kullanıcı sayısı eşiğin altında
 * kalan hücrelerin birleşimi (rol ve bölüm `null`). Her hücrenin `users` değeri en az `REPORT_MIN_GROUP_SIZE`'dır.
 */
export const usageCellSchema = z
  .object({
    kind: z.enum(['NAMED', 'OTHER']),
    type: z.enum(EVENT_TYPES),
    role: z.enum(EVENT_ROLES).nullable(),
    departmentId: z.string().nullable(),
    departmentName: z.string().nullable(),
    events: z.number().int().min(1),
    /** Aralıkta bu hücrede olay üreten ayrı kullanıcı sayısı. */
    users: z.number().int().min(REPORT_MIN_GROUP_SIZE),
  })
  .strict();

export const usageMetricsSchema = z
  .object({
    from: z.date(),
    to: z.date(),
    minGroupSize: z.literal(REPORT_MIN_GROUP_SIZE),
    /** Türe göre toplam; bastırılan hücre varsa fark alınmasını önlemek için null. */
    totalsByType: z.array(
      z.object({ type: z.enum(EVENT_TYPES), events: z.number().int().min(0).nullable() }).strict(),
    ),
    /** Kapsamdaki ayrı etkin kullanıcı sayısı; eşiğin altındaysa `null`. */
    activeUsers: z.number().int().min(REPORT_MIN_GROUP_SIZE).nullable(),
    cells: z.array(usageCellSchema),
  })
  .strict();
export type UsageMetrics = z.infer<typeof usageMetricsSchema>;

// ---------------------------------------------------------------------------------------------
// Excel toplu aktarım
// ---------------------------------------------------------------------------------------------

/**
 * `GET USAGE_EXPORT_HREF?<süzgeç>`: aynı yetki ve süzgeç şeması, aynı bastırma kuralı. Her dışa aktarma `DATA_EXPORT`
 * işlem kaydı yazar (hedef `EMPLOYMENT_REPORT` türü yerine `USAGE_METRICS`; metadata yalnız kapsam sayısı ve aralık).
 * Dosyada KİŞİ SATIRI YOKTUR; sayfalar aşağıdadır.
 */
export const USAGE_EXPORT_HREF = '/api/yonetim/rapor/kullanim';
export const USAGE_EXPORT_FILE_NAME = 'kullanim-metrikleri.xlsx';
export const USAGE_EXPORT_SHEETS = [
  { name: 'Özet', columns: ['Alan', 'Değer'] },
  { name: 'Olay türü', columns: ['Olay', 'Olay sayısı'] },
  { name: 'Rol ve bölüm', columns: ['Olay', 'Rol', 'Bölüm', 'Olay sayısı', 'Kullanıcı sayısı'] },
] as const;
/** Kullanıcı başına saatte 10 dışa aktarma. */
export const USAGE_EXPORT_RATE_LIMIT = { maxRequests: 10, windowSeconds: 3600 } as const;

export function usageExportHref(filter: UsageMetricsFilter): string {
  const parsed = usageMetricsFilterSchema.parse(filter);
  const query = new URLSearchParams();
  query.set('from', parsed.from.toISOString());
  query.set('to', parsed.to.toISOString());
  if (parsed.departmentId) query.set('departmentId', parsed.departmentId);
  if (parsed.facultyId) query.set('facultyId', parsed.facultyId);
  for (const type of [...(parsed.types ?? [])].sort()) query.append('types', type);
  return `${USAGE_EXPORT_HREF}?${query.toString()}`;
}

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları
// ---------------------------------------------------------------------------------------------

export const METRICS_ACTION_ERRORS = {
  getUsageMetrics: [
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'AUTH_NOT_VERIFIED',
    'AUTH_FORBIDDEN',
    'CONSENT_REQUIRED',
    'VALIDATION_INVALID',
  ],
} as const satisfies Record<string, readonly ErrorCode[]>;
export const USAGE_EXPORT_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'CONSENT_REQUIRED',
  'VALIDATION_INVALID',
  'RATE_LIMITED',
] as const satisfies readonly ErrorCode[];
