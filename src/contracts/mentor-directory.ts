import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { EXPERIENCE_TYPES } from './experience';

/**
 * Mentor dizini sözleşmesi (P1-09; docs/faz1-plan.md, docs/security.md "Yetkilendirme"). Servis (W1) ve ekran
 * (W2/R1) paylaşır.
 *
 * - Dizinde YALNIZ görünür mentor vardır: etkin `MentorProfile`; hesabı silinmemiş ve askıda olmayan; kendi
 *   bölümünde doğrulanmış etkin üyeliği olan; arayanla aynı üniversitede (K-07). Arayanın kendisi listelenmez.
 *   Süzgeçler görünürlüğü genişletmez, yalnız daraltır.
 * - `onlyAvailable`: "müsait değilim" modundaki (`pausedUntil` gelecekte) ve bu ayki kapasitesi dolan mentor çıkmaz.
 *   Kapasite doluluğu onaylı randevulardan gelir (P1-10 gelene kadar sayaç 0'dır: `used = 0`).
 * - `experienceTypes` yalnız mentorun ADLI (anonim olmayan) yayınlanmış deneyimlerine bakar; anonim deneyim hiçbir
 *   biçimde mentoru ele vermez.
 * - Kartta e-posta/telefon yoktur; iletişim yalnız talep akışıyla (`MentorEntryPoints`).
 * - Filtreler URL'de taşınır (`mentorFilterToParams` / `mentorFilterFromParams`). Sektör seçenekleri
 *   `listSearchSectors` ile gelir.
 * - "Sana benzer yol izleyenler": en çok `SIMILAR_MENTORS_MAX` müsait mentor, gerekçe etiketleriyle
 *   (`rules/similarity`). Gerekçedeki değerler yalnız arayanın da sahip olduğu ortak öğelerdir.
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

export const MENTOR_TYPES = ['ALUMNI', 'ACADEMIC', 'STUDENT'] as const;
export type MentorType = (typeof MENTOR_TYPES)[number];
export const MEETING_MODES = ['ONLINE', 'IN_PERSON'] as const;
export type MeetingModeName = (typeof MEETING_MODES)[number];

export const MENTOR_QUERY_MIN = 2;
export const MENTOR_QUERY_MAX = 100;
export const MENTOR_PAGE_SIZE_DEFAULT = 12;
export const MENTOR_PAGE_SIZE_MAX = 50;
export const MENTOR_PAGE_MAX = 100;
export const SIMILAR_MENTORS_MAX = 5;

const text = (min: number, max: number) =>
  z.string({ error: INVALID }).trim().min(min, { error: INVALID }).max(max, { error: INVALID });
const distinct = <T extends string>(list: readonly T[]) => new Set(list).size === list.length;
const enumList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.enum(values, { error: INVALID }), { error: INVALID })
    .min(1, { error: INVALID })
    .max(values.length, { error: INVALID })
    .refine(distinct, { error: INVALID });

export const searchMentorsSchema = z
  .object({
    /** Mentorun üyelik türü: mezun, akademisyen, öğrenci (K-08 eşiğini geçmiş). */
    mentorTypes: enumList(MENTOR_TYPES).optional(),
    /** Sektör kimliği (`listSearchSectors`): mentorun herhangi bir pozisyonunun (ya da şirketinin) sektörü. */
    sectorId: text(1, 64).optional(),
    /** Şirket adı (kısmi): sözlük adı ya da mentorun yazdığı ad. */
    company: text(MENTOR_QUERY_MIN, MENTOR_QUERY_MAX).optional(),
    /** Unvan (kısmi). */
    title: text(MENTOR_QUERY_MIN, MENTOR_QUERY_MAX).optional(),
    /** Mentorun yayınlanmış ADLI deneyim türü. */
    experienceTypes: enumList(EXPERIENCE_TYPES).optional(),
    /** Görüşme biçimlerinden herhangi birini sunan mentorlar. */
    meetingModes: enumList(MEETING_MODES).optional(),
    onlyAvailable: z.boolean({ error: INVALID }).default(false),
    page: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1)
      .max(MENTOR_PAGE_MAX)
      .default(1),
    pageSize: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1, { error: INVALID })
      .max(MENTOR_PAGE_SIZE_MAX, { error: INVALID })
      .default(MENTOR_PAGE_SIZE_DEFAULT),
  })
  .strict();
export type SearchMentorsInput = z.input<typeof searchMentorsSchema>;
export type SearchMentorsFilter = z.output<typeof searchMentorsSchema>;

// ---------------------------------------------------------------------------------------------
// URL'de taşıma
// ---------------------------------------------------------------------------------------------

const LIST_KEYS = ['mentorTypes', 'experienceTypes', 'meetingModes'] as const;
const STRING_KEYS = ['sectorId', 'company', 'title'] as const;
const NUMBER_KEYS = ['page', 'pageSize'] as const;

/** Filtreyi kanonik (alan sırası sabit, varsayılanlar atılmış) sorgu dizgisine çevirir. */
export function mentorFilterToParams(filter: SearchMentorsInput): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of STRING_KEYS) {
    const value = filter[key];
    if (typeof value === 'string' && value.trim() !== '') params.set(key, value.trim());
  }
  for (const key of LIST_KEYS) {
    for (const value of [...(filter[key] ?? [])].sort()) params.append(key, value);
  }
  if (filter.onlyAvailable === true) params.set('onlyAvailable', '1');
  if (filter.pageSize !== undefined && filter.pageSize !== MENTOR_PAGE_SIZE_DEFAULT) {
    params.set('pageSize', String(filter.pageSize));
  }
  if (filter.page !== undefined && filter.page > 1) params.set('page', String(filter.page));
  return params;
}

/**
 * URL'den ham filtre girdisi üretir (bilinmeyen anahtarlar atılır); `searchMentorsSchema` ile doğrulanır.
 * `onlyAvailable` yalnız `1` / `true` iken açıktır; sayı olmayan sayı alanı şemanın reddetmesi için olduğu gibi kalır.
 */
export function mentorFilterFromParams(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, unknown> {
  const get = (key: string): string[] => {
    if (params instanceof URLSearchParams) return params.getAll(key);
    const value = params[key];
    return value === undefined ? [] : Array.isArray(value) ? value : [value];
  };
  const input: Record<string, unknown> = {};
  for (const key of STRING_KEYS) {
    const [value] = get(key);
    if (value !== undefined && value.trim() !== '') input[key] = value;
  }
  for (const key of LIST_KEYS) {
    const values = get(key).filter((value) => value !== '');
    if (values.length > 0) input[key] = values;
  }
  const [flag] = get('onlyAvailable');
  if (flag === '1' || flag === 'true') input.onlyAvailable = true;
  for (const key of NUMBER_KEYS) {
    const [value] = get(key);
    if (value !== undefined && value.trim() !== '') {
      const number = Number(value);
      input[key] = Number.isFinite(number) ? number : value;
    }
  }
  return input;
}

// ---------------------------------------------------------------------------------------------
// Mentor kartı
// ---------------------------------------------------------------------------------------------

export const MENTOR_UNAVAILABLE_REASONS = ['PAUSED', 'CAPACITY_FULL'] as const;
export type MentorUnavailableReason = (typeof MENTOR_UNAVAILABLE_REASONS)[number];

export const mentorAvailabilitySchema = z
  .object({
    available: z.boolean(),
    /** `available` ise `null`. */
    reason: z.enum(MENTOR_UNAVAILABLE_REASONS).nullable(),
    /** "Müsait değilim" modunun bitiş tarihi (yalnız `PAUSED`). */
    pausedUntil: z.date().nullable(),
  })
  .strict();

export const mentorCardSchema = z
  .object({
    userId: z.string(),
    displayName: z.string(),
    headline: z.string().nullable(),
    mentorType: z.enum(MENTOR_TYPES),
    departmentName: z.string(),
    graduationYear: z.number().int().nullable(),
    /** Güncel (yoksa en son) pozisyon; mentorun yazdığı ham metin. */
    position: z.object({ company: z.string(), title: z.string() }).strict().nullable(),
    sectorName: z.string().nullable(),
    /** İlgi alanı etiketleri (sabit anahtarlar; görünen metin mesaj kataloğunda). */
    topics: z.array(z.string()),
    /** En fazla 5 beceri adı. */
    skills: z.array(z.string()).max(5),
    availability: mentorAvailabilitySchema,
    capacity: z
      .object({
        monthly: z.number().int().min(0),
        /** Bu ay onaylı randevu sayısı (P1-10'a kadar 0). */
        used: z.number().int().min(0),
        remaining: z.number().int().min(0),
      })
      .strict(),
    sessionMinutes: z.number().int(),
    meetingModes: z.array(z.enum(MEETING_MODES)),
    cvReviewEnabled: z.boolean(),
  })
  .strict();
export type MentorCard = z.infer<typeof mentorCardSchema>;

export const mentorPageSchema = z
  .object({
    items: z.array(mentorCardSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    /** Filtreye uyan toplam mentor (görünürlük süzgecinden sonra). */
    total: z.number().int().min(0),
    hasMore: z.boolean(),
  })
  .strict();
export type MentorPage = z.infer<typeof mentorPageSchema>;

// ---------------------------------------------------------------------------------------------
// "Sana benzer yol izleyenler"
// ---------------------------------------------------------------------------------------------

export const SIMILARITY_REASON_CODES = [
  'SAME_SECTOR',
  'SHARED_INTEREST',
  'SHARED_SKILL',
  'SHARED_GOAL',
  'SAME_DEPARTMENT',
] as const;
export type SimilarityReasonCode = (typeof SIMILARITY_REASON_CODES)[number];

/** `values`: ortak öğeler (ilgi/hedef: sabit anahtar, beceri ve sektör: görünen ad, bölüm: bölüm adı); en çok 3. */
export const similarityReasonSchema = z
  .object({
    code: z.enum(SIMILARITY_REASON_CODES),
    values: z.array(z.string()).min(1).max(3),
  })
  .strict();
export type SimilarityReason = z.infer<typeof similarityReasonSchema>;

export const similarMentorSchema = z
  .object({
    mentor: mentorCardSchema,
    /** En az bir gerekçe vardır; en önemlisi başta. */
    reasons: z.array(similarityReasonSchema).min(1),
  })
  .strict();
export const similarMentorsSchema = z
  .object({ items: z.array(similarMentorSchema).max(SIMILAR_MENTORS_MAX) })
  .strict();
export type SimilarMentors = z.infer<typeof similarMentorsSchema>;

// ---------------------------------------------------------------------------------------------
// Profilden giriş noktaları (randevu P1-10, CV incelemesi P1-15, iletişim talebi mevcut)
// ---------------------------------------------------------------------------------------------

export const getMentorEntryPointsSchema = z.object({ userId: text(1, 64) }).strict();
export type GetMentorEntryPointsInput = z.input<typeof getMentorEntryPointsSchema>;

export const ENTRY_POINT_BLOCK_REASONS = [
  'NOT_MENTOR',
  'SELF',
  'PAUSED',
  'CAPACITY_FULL',
  'CV_REVIEW_DISABLED',
] as const;
export type EntryPointBlockReason = (typeof ENTRY_POINT_BLOCK_REASONS)[number];

const entryPointSchema = z
  .object({
    available: z.boolean(),
    /** `available` ise `null`. Ekran sebebi düğmenin yanında yazar. */
    reason: z.enum(ENTRY_POINT_BLOCK_REASONS).nullable(),
  })
  .strict();

/**
 * Yalnız uygunluk bayrağıdır; talebi oluşturan eylemler kendi kartlarında gelir (randevu P1-10, CV incelemesi
 * P1-15, iletişim talebi `contactRequest`). Hedef görünür mentor değilse `NOT_MENTOR` (varlık ayrımı yapılmaz).
 */
export const mentorEntryPointsSchema = z
  .object({
    appointment: entryPointSchema,
    cvReview: entryPointSchema,
    contact: entryPointSchema,
  })
  .strict();
export type MentorEntryPoints = z.infer<typeof mentorEntryPointsSchema>;

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları
// ---------------------------------------------------------------------------------------------

const authErrors = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
] as const;

export const MENTOR_DIRECTORY_ACTION_ERRORS = {
  searchMentors: [...authErrors, 'VALIDATION_INVALID'],
  getSimilarMentors: [...authErrors],
  getMentorEntryPoints: [...authErrors, 'VALIDATION_INVALID'],
} as const satisfies Record<string, readonly ErrorCode[]>;
