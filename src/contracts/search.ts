import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { APPLICATION_CHANNELS, EXPERIENCE_PAY, EXPERIENCE_TYPES, TERM_SEASONS } from './experience';

/**
 * Deneyim arama sözleşmesi (P1-08; docs/architecture.md "Arama"). Servis (W1) ve ekran (W2) paylaşır.
 *
 * - Filtreler URL'de taşınır (`searchFilterToParams` / `searchFilterFromParams`): aynı filtre her zaman aynı
 *   bağlantıyı üretir, paylaşılan bağlantı aynı sonuçları açar. Sorgu metni metriklere/loga yazılmaz.
 * - Sonuç yalnız YAYINLANMIŞ deneyimlerdir ve K-07'ye uyar: arayan, deneyimin yazıldığı bölümün üniversitesinde
 *   doğrulanmış etkin üyedir. Süzgeçler görünürlüğü genişletmez, yalnız daraltır.
 * - Anonim deneyimin sonuç şemasında yazar alanı YOKTUR. Yazarı silinmiş/askıdaki ya da yazar bağı kopmuş
 *   (K-09 anonimleştirme) deneyim de yazarsız (anonim biçimde) döner.
 * - Sektör süzgeci deneyimin sözlükle eşleşmiş şirketi (`Experience.companyId` → `Company.sectorId`) üzerindendir;
 *   şirketi sözlüğe bağlı olmayan deneyim sektör süzgecinde çıkmaz. Seçenekler `listSearchSectors` ile gelir.
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

export const SEARCH_QUERY_MIN = 2;
export const SEARCH_QUERY_MAX = 100;
export const SEARCH_PAGE_SIZE_DEFAULT = 20;
export const SEARCH_PAGE_SIZE_MAX = 50;
export const SEARCH_PAGE_MAX = 200;
export const SEARCH_SORTS = ['RELEVANCE', 'NEWEST'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

const text = (min: number, max: number) =>
  z.string({ error: INVALID }).trim().min(min, { error: INVALID }).max(max, { error: INVALID });
const distinct = <T extends string>(list: readonly T[]) => new Set(list).size === list.length;

export const searchExperiencesSchema = z
  .object({
    /** Serbest metin (Türkçe tam metin + yazım hatası toleransı); yoksa en yeniler. */
    q: text(SEARCH_QUERY_MIN, SEARCH_QUERY_MAX).optional(),
    types: z
      .array(z.enum(EXPERIENCE_TYPES, { error: INVALID }), { error: INVALID })
      .max(EXPERIENCE_TYPES.length, { error: INVALID })
      .refine(distinct, { error: INVALID })
      .optional(),
    /** Şirket/kurum adı (kısmi ve yazım hatasına toleranslı). */
    company: text(SEARCH_QUERY_MIN, SEARCH_QUERY_MAX).optional(),
    channels: z
      .array(z.enum(APPLICATION_CHANNELS, { error: INVALID }), { error: INVALID })
      .max(APPLICATION_CHANNELS.length, { error: INVALID })
      .refine(distinct, { error: INVALID })
      .optional(),
    /** Sektör kimliği (`listSearchSectors`). */
    sectorId: text(1, 64).optional(),
    termYear: z.number({ error: INVALID }).int({ error: INVALID }).min(1900).max(2100).optional(),
    termSeason: z.enum(TERM_SEASONS, { error: INVALID }).optional(),
    pay: z.enum(EXPERIENCE_PAY, { error: INVALID }).optional(),
    /** Varsayılan: metin varsa `RELEVANCE`, yoksa `NEWEST`. */
    sort: z.enum(SEARCH_SORTS, { error: INVALID }).optional(),
    page: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1)
      .max(SEARCH_PAGE_MAX)
      .default(1),
    pageSize: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1, { error: INVALID })
      .max(SEARCH_PAGE_SIZE_MAX, { error: INVALID })
      .default(SEARCH_PAGE_SIZE_DEFAULT),
  })
  .strict()
  .refine((value) => value.sort !== 'RELEVANCE' || value.q !== undefined, {
    error: INVALID,
    path: ['sort'],
  });
export type SearchExperiencesInput = z.input<typeof searchExperiencesSchema>;
export type SearchExperiencesFilter = z.output<typeof searchExperiencesSchema>;

// ---------------------------------------------------------------------------------------------
// URL'de taşıma
// ---------------------------------------------------------------------------------------------

const LIST_KEYS = ['types', 'channels'] as const;
const NUMBER_KEYS = ['termYear', 'page', 'pageSize'] as const;
const STRING_KEYS = ['q', 'company', 'sectorId', 'termSeason', 'pay', 'sort'] as const;

/**
 * Filtreyi kanonik (alan sırası sabit, varsayılanlar atılmış) sorgu dizgisine çevirir. Boş/tanımsız alan yazılmaz.
 */
export function searchFilterToParams(filter: SearchExperiencesInput): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of STRING_KEYS) {
    const value = filter[key];
    if (typeof value === 'string' && value.trim() !== '') params.set(key, value.trim());
  }
  for (const key of LIST_KEYS) {
    for (const value of [...(filter[key] ?? [])].sort()) params.append(key, value);
  }
  if (filter.termYear !== undefined) params.set('termYear', String(filter.termYear));
  if (filter.pageSize !== undefined && filter.pageSize !== SEARCH_PAGE_SIZE_DEFAULT) {
    params.set('pageSize', String(filter.pageSize));
  }
  if (filter.page !== undefined && filter.page > 1) params.set('page', String(filter.page));
  return params;
}

/**
 * URL'den ham filtre girdisi üretir (bilinmeyen anahtarlar atılır); `searchExperiencesSchema` ile doğrulanır.
 * Sayı olmayan sayı alanı olduğu gibi bırakılır ki şema reddetsin (ekran varsayılana düşer).
 */
export function searchFilterFromParams(
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
  for (const key of NUMBER_KEYS) {
    const [value] = get(key);
    if (value !== undefined && value.trim() !== '') {
      const number = Number(value);
      input[key] = value.trim() !== '' && Number.isFinite(number) ? number : value;
    }
  }
  return input;
}

// ---------------------------------------------------------------------------------------------
// Sonuç
// ---------------------------------------------------------------------------------------------

const resultFields = {
  id: z.string(),
  type: z.enum(EXPERIENCE_TYPES),
  organizationName: z.string().nullable(),
  companyId: z.string().optional(),
  departmentName: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  termYear: z.number().int().nullable(),
  termSeason: z.enum(TERM_SEASONS).nullable(),
  durationWeeks: z.number().int().nullable(),
  pay: z.enum(EXPERIENCE_PAY).nullable(),
  applicationChannel: z.enum(APPLICATION_CHANNELS).nullable(),
  /** "Ne öğrendim" metninin başı (düz metin, en fazla 220 karakter). */
  snippet: z.string().max(220),
  publishedAt: z.date(),
};

/** Anonim dalın TİPİNDE yazar alanı yoktur. */
export const anonymousSearchResultSchema = z
  .object({ ...resultFields, isAnonymous: z.literal(true) })
  .strict();
export const namedSearchResultSchema = z
  .object({
    ...resultFields,
    isAnonymous: z.literal(false),
    author: z.object({ id: z.string(), displayName: z.string() }).strict(),
  })
  .strict();
export const searchResultSchema = z.discriminatedUnion('isAnonymous', [
  anonymousSearchResultSchema,
  namedSearchResultSchema,
]);
export type SearchResult = z.infer<typeof searchResultSchema>;

export const searchPageSchema = z
  .object({
    items: z.array(searchResultSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    /** Filtreye uyan toplam sonuç (görünürlük süzgecinden sonra). */
    total: z.number().int().min(0),
    hasMore: z.boolean(),
    /** Uygulanan sıralama (varsayılan çözümlenmiş). */
    sort: z.enum(SEARCH_SORTS),
  })
  .strict();
export type SearchPage = z.infer<typeof searchPageSchema>;

export const searchSectorsSchema = z
  .object({ sectors: z.array(z.object({ id: z.string(), name: z.string() }).strict()) })
  .strict();
export type SearchSectors = z.infer<typeof searchSectorsSchema>;

export const SEARCH_ACTION_ERRORS = {
  searchExperiences: [
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'AUTH_NOT_VERIFIED',
    'AUTH_FORBIDDEN',
    'VALIDATION_INVALID',
  ],
  listSearchSectors: [
    'AUTH_UNAUTHENTICATED',
    'AUTH_ACCOUNT_SUSPENDED',
    'AUTH_NOT_VERIFIED',
    'AUTH_FORBIDDEN',
  ],
} as const satisfies Record<string, readonly ErrorCode[]>;
