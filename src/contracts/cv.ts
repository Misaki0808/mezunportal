import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { DOCUMENT_MIME_TYPE, MAX_DOCUMENT_BYTES } from './graduation-document';

/**
 * CV ayrıştırma hattı sözleşmesi (P1-05; D8, docs/architecture.md "CV ayrıştırma hattı"). Servis (W1) ve
 * ekran (W2, P1-06) bunu paylaşır; ikisi de DEĞİŞTİRMEZ (değişiklik `ORTAK DOSYA İSTEĞİ`). Zod hata mesajları
 * bir `ErrorCode`'dur.
 *
 * Güven sınırı: `ParsedCv` LLM'in çıktısıdır ve GÜVENİLMEYEN girdidir. Şema bilinmeyen alanları atar, her
 * metni temizler ve sınırlar; çıktı yalnız profil kalemlerine ÖNERİ olur, kullanıcı kalem kalem onaylamadan
 * hiçbir şey yazılmaz; rol, yetki, doğrulama durumu ve başka kullanıcının verisi şemada YOKTUR.
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

// ---------------------------------------------------------------------------------------------
// Sınırlar
// ---------------------------------------------------------------------------------------------

export const CV_MAX_BYTES = MAX_DOCUMENT_BYTES;
export const CV_MAX_PAGES = 6;
export const CV_MIME_TYPE = DOCUMENT_MIME_TYPE;
/** Kullanıcı başına günlük ayrıştırma sınırı varsayılanı (`CV_PARSE_DAILY_LIMIT` ile değişir). */
export const CV_PARSE_DAILY_LIMIT_DEFAULT = 5;
export const CV_PARSE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Doğrulanmış ayrıştırma çıktısının serileştirilmiş üst boyutu (taşkın korumasının son halkası). */
export const CV_PARSED_JSON_MAX_BYTES = 64 * 1024;

export const CV_LIMITS = {
  education: 10,
  positions: 30,
  skills: 60,
  languages: 10,
  certifications: 20,
  name: 200,
  shortName: 80,
  languageName: 60,
  description: 1000,
} as const;

/** Karar listesi üst sınırı (bir CV'den en fazla bu kadar kalem üretilebilir). */
export const CV_DECISIONS_MAX = 200;

// ---------------------------------------------------------------------------------------------
// Metin temizliği (LLM çıktısı ve onay ekranı düzeltmeleri için ortak)
// ---------------------------------------------------------------------------------------------

/** Denetim karakterleri, sıfır genişlikli ve çift yönlü biçim karakterleri (görünmez talimat/yanıltma). */
const INVISIBLE = new RegExp(
  [
    '[',
    '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F',
    '\\u00AD\\u200B-\\u200F\\u2028\\u2029\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF',
    ']',
  ].join(''),
  'g',
);

/** Görünmez karakterleri atar, boşlukları teke indirir, kenar boşluklarını keser. */
export function cleanCvText(value: string): string {
  return value.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
}

const text = (max: number) =>
  z
    .string({ error: INVALID })
    .transform(cleanCvText)
    .pipe(z.string().min(1, { error: INVALID }).max(max, { error: INVALID }));

const optionalText = (max: number) =>
  z
    .string({ error: INVALID })
    .nullish()
    .transform((value) => (value == null ? null : cleanCvText(value) || null))
    .pipe(z.string().max(max, { error: INVALID }).nullable());

/** Açıklama uzunsa ATILMAZ, kesilir: uzun açıklama yüzünden bütün CV'yi reddetmek gereksizdir. */
const description = z
  .string({ error: INVALID })
  .nullish()
  .transform((value) =>
    value == null ? null : cleanCvText(value).slice(0, CV_LIMITS.description) || null,
  );

/** `YYYY` ya da `YYYY-MM`. */
export const YEAR_MONTH_PATTERN = /^(19[5-9]\d|20\d{2}|2100)(-(0[1-9]|1[0-2]))?$/;
const yearMonth = z
  .string({ error: INVALID })
  .regex(YEAR_MONTH_PATTERN, { error: INVALID })
  .nullish()
  .transform((value) => value ?? null);

function monthIndex(value: string, fallbackMonth: number): number {
  const [year, month] = value.split('-');
  return Number(year) * 12 + (month ? Number(month) : fallbackMonth);
}

/** Bitiş başlangıçtan önce mi? Eksik ay en uygun yöne çekilir (bitiş Aralık, başlangıç Ocak; DB CHECK'iyle aynı). */
export function endsBeforeStart(end: string, start: string): boolean {
  return monthIndex(end, 12) < monthIndex(start, 1);
}

// ---------------------------------------------------------------------------------------------
// ParsedCv — LLM çıktısı
// ---------------------------------------------------------------------------------------------

export const EMPLOYMENT_TYPES = [
  'FULL_TIME',
  'PART_TIME',
  'INTERNSHIP',
  'CONTRACT',
  'FREELANCE',
  'VOLUNTEER',
  'OTHER',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EDUCATION_LEVELS = [
  'HIGH_SCHOOL',
  'ASSOCIATE',
  'BACHELOR',
  'MASTER',
  'DOCTORATE',
  'OTHER',
] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];
export const LANGUAGE_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'NATIVE'] as const;
export type LanguageLevel = (typeof LANGUAGE_LEVELS)[number];

type DatedValue = { startDate: string | null; endDate: string | null; isCurrent: boolean };

/** Bitiş başlangıçtan önce olamaz; süren kalemin bitişi yoktur (model "Present" yazınca bitiş atılır). */
function normalizeDates<T extends DatedValue>(value: T, ctx: z.RefinementCtx): T {
  const endDate = value.isCurrent ? null : value.endDate;
  if (value.startDate && endDate && endsBeforeStart(endDate, value.startDate)) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: INVALID });
  }
  return { ...value, endDate };
}

export const parsedEducationSchema = z
  .object({
    institution: text(CV_LIMITS.name),
    level: z
      .enum(EDUCATION_LEVELS, { error: INVALID })
      .nullish()
      .transform((v) => v ?? null),
    fieldOfStudy: optionalText(CV_LIMITS.name),
    startDate: yearMonth,
    endDate: yearMonth,
    isCurrent: z.boolean({ error: INVALID }).default(false),
  })
  .transform(normalizeDates);
export type ParsedEducation = z.output<typeof parsedEducationSchema>;

export const parsedPositionSchema = z
  .object({
    company: text(CV_LIMITS.name),
    title: text(CV_LIMITS.name),
    employmentType: z
      .enum(EMPLOYMENT_TYPES, { error: INVALID })
      .nullish()
      .transform((v) => v ?? null),
    startDate: yearMonth,
    endDate: yearMonth,
    isCurrent: z.boolean({ error: INVALID }).default(false),
    description,
  })
  .transform(normalizeDates);
export type ParsedPosition = z.output<typeof parsedPositionSchema>;

export const parsedLanguageSchema = z.object({
  name: text(CV_LIMITS.languageName),
  level: z
    .enum(LANGUAGE_LEVELS, { error: INVALID })
    .nullish()
    .transform((v) => v ?? null),
});
export type ParsedLanguage = z.output<typeof parsedLanguageSchema>;

export const parsedCertificationSchema = z.object({
  name: text(CV_LIMITS.name),
  issuer: optionalText(CV_LIMITS.name),
  issuedDate: yearMonth,
});
export type ParsedCertification = z.output<typeof parsedCertificationSchema>;

export const parsedSkillSchema = text(CV_LIMITS.shortName);

/**
 * Profil üst alanları (başlık, özet, şehir). Bağlantılar (LinkedIn, sosyal) ve iletişim bilgisi BİLEREK yoktur:
 * LLM çıktısı güvenilmezdir; bağlantıyı kullanıcı izinli alan adı listesiyle elle ekler.
 */
export const CV_PROFILE_LIMITS = { headline: 120, summary: 1500, city: 80 } as const;
export const PROFILE_FIELDS = ['headline', 'summary', 'city'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export const parsedProfileSchema = z.object({
  headline: optionalText(CV_PROFILE_LIMITS.headline).default(null),
  summary: optionalText(CV_PROFILE_LIMITS.summary).default(null),
  city: optionalText(CV_PROFILE_LIMITS.city).default(null),
});
export type ParsedProfile = z.output<typeof parsedProfileSchema>;

/**
 * Bilinmeyen alanlar (`role`, `userId`, `isAdmin` …) sessizce atılır; yetki/kimlik alanı şemada yoktur.
 * Boş bölümler atlanabilir (varsayılan `[]`).
 */
export const parsedCvSchema = z.object({
  profile: parsedProfileSchema.default({ headline: null, summary: null, city: null }),
  education: z.array(parsedEducationSchema).max(CV_LIMITS.education).default([]),
  positions: z.array(parsedPositionSchema).max(CV_LIMITS.positions).default([]),
  skills: z.array(parsedSkillSchema).max(CV_LIMITS.skills).default([]),
  languages: z.array(parsedLanguageSchema).max(CV_LIMITS.languages).default([]),
  certifications: z.array(parsedCertificationSchema).max(CV_LIMITS.certifications).default([]),
});
export type ParsedCv = z.output<typeof parsedCvSchema>;

/** Sağlayıcıya yapılandırılmış çıktı şeması olarak verilen JSON Şeması (girdi tarafı; dönüşümler hariç). */
export function parsedCvJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(parsedCvSchema, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
}

export function parsedCvItemCount(cv: ParsedCv): number {
  const profileFilled = PROFILE_FIELDS.some((field) => cv.profile[field] !== null);
  return (
    (profileFilled ? 1 : 0) +
    cv.education.length +
    cv.positions.length +
    cv.skills.length +
    cv.languages.length +
    cv.certifications.length
  );
}

// ---------------------------------------------------------------------------------------------
// Kullanılabilirlik, yükleme, durum
// ---------------------------------------------------------------------------------------------

export const CV_STATUSES = [
  'QUEUED',
  'PARSING',
  'PARSED',
  'FAILED',
  'APPLIED',
  'DISCARDED',
] as const;
export type CvStatus = (typeof CV_STATUSES)[number];

/** Yükleme neden kapalı? Ekran sebebi gösterir; elle giriş her zaman açıktır. */
export const CV_UNAVAILABLE_REASONS = [
  'PROVIDER_NOT_CONFIGURED',
  'TRANSFER_CONSENT_REQUIRED',
  'DAILY_LIMIT_REACHED',
  'ALREADY_PROCESSING',
] as const;
export type CvUnavailableReason = (typeof CV_UNAVAILABLE_REASONS)[number];

export const cvAvailabilitySchema = z.object({
  available: z.boolean(),
  reason: z.enum(CV_UNAVAILABLE_REASONS).nullable(),
  dailyLimit: z.number().int().min(1),
  remainingToday: z.number().int().min(0),
});
export type CvAvailability = z.infer<typeof cvAvailabilitySchema>;

/**
 * Yükleme `FormData` ile yapılır (`uploadCv(formData)`); tek alan: `file`. Hata kodları `fieldErrors.file`.
 * Sunucu dosyayı içeriğinden yeniden doğrular (sihirli bayt, sayfa sayısı, şifreli PDF).
 */
export const cvUploadFormSchema = z.object({
  file: z
    .file({ error: 'DOCUMENT_REQUIRED' })
    .min(1, { error: 'DOCUMENT_EMPTY' })
    .max(CV_MAX_BYTES, { error: 'DOCUMENT_TOO_LARGE' })
    .mime(CV_MIME_TYPE, { error: 'DOCUMENT_NOT_PDF' }),
});
export type CvUploadForm = z.output<typeof cvUploadFormSchema>;

export function cvUploadFormInput(formData: FormData): Record<string, unknown> {
  return { file: formData.get('file') };
}

export const cvUploadOutputSchema = z.object({
  cvUploadId: z.string(),
  status: z.literal('QUEUED'),
});
export type CvUploadOutput = z.infer<typeof cvUploadOutputSchema>;

export const cvIdSchema = z.object({ cvUploadId: z.string({ error: INVALID }).min(1).max(64) });
export type CvIdInput = z.input<typeof cvIdSchema>;

export const cvStatusOutputSchema = z.object({
  cvUploadId: z.string(),
  status: z.enum(CV_STATUSES),
  /** Yalnız `FAILED`'da: `CV_PARSE_*` ve benzeri kararlı kod; ekran elle düzenlemeye yönlendirir. */
  errorCode: z.string().nullable(),
  createdAt: z.string(),
});
export type CvStatusOutput = z.infer<typeof cvStatusOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Onay ekranı: mevcut profille fark (rules/cvDiff)
// ---------------------------------------------------------------------------------------------

export const CV_SECTIONS = [
  'PROFILE',
  'EDUCATION',
  'POSITION',
  'LANGUAGE',
  'CERTIFICATION',
  'SKILL',
] as const;
export type CvSection = (typeof CV_SECTIONS)[number];

/**
 * `NEW`: profilde yok · `CHANGED`: profilde var, CV farklı (elle düzeltilmemiş) · `CONFLICT`: profilde var,
 * kullanıcı elle düzeltmiş ve CV farklı — sessizce ezilmez, ayrı gösterilir; yazmak için açık seçim ister.
 */
export const CV_ITEM_STATUSES = ['NEW', 'CHANGED', 'CONFLICT'] as const;
export type CvItemStatus = (typeof CV_ITEM_STATUSES)[number];

/** Sözlükle standartlaştırılmış görünen ad; `null` = eşleşmedi (ham değer yönetici kuyruğuna düşer). */
export type CvStandardized = {
  company?: string | null;
  title?: string | null;
  skill?: string | null;
};

type ItemBase = {
  /** Kararlı kalem anahtarı; karar bu anahtarla verilir. */
  key: string;
  status: CvItemStatus;
  /** Profilde var olan kalemle farklı olan alan adları (`NEW`'de boş). */
  changedFields: string[];
  standardized: CvStandardized;
};
export type CvReviewItem =
  | (ItemBase & {
      /** Başlık/özet/şehir tek kalemdir; `changedFields` farklı olan alanlardır. */
      section: 'PROFILE';
      proposed: ParsedProfile;
      current: ParsedProfile | null;
    })
  | (ItemBase & {
      section: 'EDUCATION';
      proposed: ParsedEducation;
      current: ParsedEducation | null;
    })
  | (ItemBase & {
      section: 'POSITION';
      proposed: ParsedPosition;
      current: ParsedPosition | null;
    })
  | (ItemBase & {
      section: 'LANGUAGE';
      proposed: ParsedLanguage;
      current: ParsedLanguage | null;
    })
  | (ItemBase & {
      section: 'CERTIFICATION';
      proposed: ParsedCertification;
      current: ParsedCertification | null;
    })
  | (ItemBase & { section: 'SKILL'; proposed: { name: string }; current: { name: string } | null });

export type CvReview = {
  cvUploadId: string;
  items: CvReviewItem[];
  /** Profilde zaten aynı olan kalem sayısı (listelenmez). */
  unchangedCount: number;
};

// ---------------------------------------------------------------------------------------------
// Uygulama: kullanıcının kalem kalem kararı
// ---------------------------------------------------------------------------------------------

const decisionBase = {
  key: z.string({ error: INVALID }).min(1).max(64),
  /** `CONFLICT` kalemde elle düzeltmenin üzerine yazmak için AÇIK onay; yoksa `CV_CONFLICT_UNRESOLVED`. */
  overwriteMine: z.boolean({ error: INVALID }).default(false),
};

/**
 * Kabul edilen kalem. `values` verilirse kullanıcı öneriyi onay ekranında düzeltmiştir (aynı şema geçerlidir) ve
 * kalem elle düzeltilmiş sayılır. Kararı olmayan kalem YAZILMAZ; `CONFLICT` kalem de açık seçim olmadan yazılmaz.
 */
export const cvDecisionSchema = z.discriminatedUnion('section', [
  z.object({
    ...decisionBase,
    section: z.literal('PROFILE'),
    values: parsedProfileSchema.optional(),
  }),
  z.object({
    ...decisionBase,
    section: z.literal('EDUCATION'),
    values: parsedEducationSchema.optional(),
  }),
  z.object({
    ...decisionBase,
    section: z.literal('POSITION'),
    values: parsedPositionSchema.optional(),
  }),
  z.object({
    ...decisionBase,
    section: z.literal('LANGUAGE'),
    values: parsedLanguageSchema.optional(),
  }),
  z.object({
    ...decisionBase,
    section: z.literal('CERTIFICATION'),
    values: parsedCertificationSchema.optional(),
  }),
  z.object({
    ...decisionBase,
    section: z.literal('SKILL'),
    values: z.object({ name: parsedSkillSchema }).optional(),
  }),
]);
export type CvDecision = z.output<typeof cvDecisionSchema>;
export type CvDecisionInput = z.input<typeof cvDecisionSchema>;

export const applyCvSchema = z.object({
  cvUploadId: cvIdSchema.shape.cvUploadId,
  decisions: z
    .array(cvDecisionSchema, { error: INVALID })
    .min(1, { error: INVALID })
    .max(CV_DECISIONS_MAX, { error: INVALID })
    .refine((list) => new Set(list.map((decision) => decision.key)).size === list.length, {
      error: INVALID,
    }),
});
export type ApplyCvInput = z.input<typeof applyCvSchema>;

export const applyCvOutputSchema = z.object({
  created: z.number().int().min(0),
  updated: z.number().int().min(0),
  /** Yeni oluşan "bu stajı yazmak ister misin?" davetleri. */
  invitations: z.number().int().min(0),
});
export type ApplyCvOutput = z.infer<typeof applyCvOutputSchema>;

export const discardCvOutputSchema = z.object({ discarded: z.literal(true) });
export type DiscardCvOutput = z.infer<typeof discardCvOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Staj → deneyim daveti
// ---------------------------------------------------------------------------------------------

export const experienceInvitationSchema = z.object({
  id: z.string(),
  positionId: z.string(),
  company: z.string(),
  title: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
});
export type ExperienceInvitationView = z.infer<typeof experienceInvitationSchema>;
export const experienceInvitationsOutputSchema = z.object({
  invitations: z.array(experienceInvitationSchema),
});
export type ExperienceInvitationsOutput = z.infer<typeof experienceInvitationsOutputSchema>;

export const dismissInvitationSchema = z.object({
  invitationId: z.string({ error: INVALID }).min(1).max(64),
});
export type DismissInvitationInput = z.input<typeof dismissInvitationSchema>;

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları
// ---------------------------------------------------------------------------------------------

const SESSION = ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'] as const;

/** Ayrıştırma işinin `CvUpload.errorCode` olarak yazabileceği kodlar (durum çıktısında görünür). */
export const CV_PARSE_FAILURE_CODES = [
  'CV_PARSE_UNAVAILABLE',
  'CV_PARSE_TIMEOUT',
  'CV_PARSE_INVALID_OUTPUT',
  'CV_PARSE_EMPTY',
  'CV_PROVIDER_NOT_CONFIGURED',
  'CV_TRANSFER_CONSENT_REQUIRED',
] as const satisfies readonly ErrorCode[];
export type CvParseFailureCode = (typeof CV_PARSE_FAILURE_CODES)[number];

export const CV_ACTION_ERRORS = {
  getCvAvailability: [...SESSION],
  uploadCv: [
    ...SESSION,
    'VALIDATION_INVALID',
    'DOCUMENT_REQUIRED',
    'DOCUMENT_EMPTY',
    'DOCUMENT_TOO_LARGE',
    'DOCUMENT_NOT_PDF',
    'CV_PDF_UNREADABLE',
    'CV_TOO_MANY_PAGES',
    'CV_PROVIDER_NOT_CONFIGURED',
    'CV_TRANSFER_CONSENT_REQUIRED',
    'CV_DAILY_LIMIT_REACHED',
    'CV_ALREADY_PROCESSING',
    'CV_PARSE_UNAVAILABLE',
  ],
  getLatestCv: [...SESSION],
  getCvStatus: [...SESSION, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  getCvReview: [...SESSION, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND', 'CV_NOT_READY'],
  applyCv: [
    ...SESSION,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'CV_NOT_READY',
    'CV_REVIEW_STALE',
    'CV_CONFLICT_UNRESOLVED',
  ],
  discardCv: [...SESSION, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND', 'CV_NOT_READY'],
  listExperienceInvitations: [...SESSION],
  dismissExperienceInvitation: [...SESSION, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
} as const satisfies Record<string, readonly ErrorCode[]>;
