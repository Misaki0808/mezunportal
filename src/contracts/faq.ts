import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { adminId, adminPageInput, adminReason } from './admin';

/**
 * SSS akışı sözleşmesi (P1-17; docs/architecture.md "SSS akışı"). Servis (W1) ve ekranlar (W2) paylaşır; DEĞİŞTİRMEZLER
 * (değişiklik `ORTAK DOSYA İSTEĞİ`).
 *
 * Akış: öğrenci "SSS talebi gönder" (hız sınırlı; yazarken benzer SSS gösterilir) → mentorlar cevap yazar → moderatör
 * (kapsamı) en iyi cevabı seçip soruyu/cevabı DÜZENLEYEREK yayımlar, gerekçeyle reddeder ya da mentorluğa yönlendirir.
 * Puan yalnız yayında yazılır (soran 2, seçilen cevap 5, katılım 1; P1-16 `awardPoint`, idempotent).
 *
 * Gizlilik (sunucuda zorlanır):
 *  - YAYINDA hiçbir isim/kimlik yoktur: `FaqItem` çıktısı yalnız soru, cevap ve tarihtir. Yayın metni soran ve cevap
 *    verenlerin adlarını, e-posta/telefon biçimini içeremez (`FAQ_IDENTITY_LEAK`); denetim yayın anında sunucudadır.
 *  - Soran kimliği mentora ve moderatöre hiç gösterilmez; cevap yazanlar moderatöre kimliksiz görünür.
 *  - Yayınlanan SSS, kaynak talebin bölümünün üniversitesindeki doğrulanmış etkin üyelere açıktır (K-07).
 *  - Yayın/ret/yönlendirme `recordAdminAction` ile AYNI işlemde kaydedilir (`MODERATION_PUBLISH`, `MODERATION_REJECT`,
 *    `MODERATION_REDIRECT`; hedef `FAQ_REQUEST`).
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

export const FAQ_QUESTION_MIN = 15;
export const FAQ_QUESTION_MAX = 500;
export const FAQ_ANSWER_MIN = 20;
export const FAQ_ANSWER_MAX = 2000;
export const FAQ_SIMILAR_LIMIT = 5;
export const FAQ_PAGE_SIZE_DEFAULT = 20;
export const FAQ_PAGE_SIZE_MAX = 50;

/** Ekran bağlantıları (yönlendirilen öğrenci mentor dizinine gider). */
export const FAQ_PAGE_HREF = '/sss';
export const FAQ_MY_REQUESTS_HREF = '/hesap/sss';
export const FAQ_MENTOR_DIRECTORY_HREF = '/mentorlar';

export const FAQ_STATUSES = ['OPEN', 'PUBLISHED', 'REJECTED', 'REDIRECTED'] as const;
export type FaqStatus = (typeof FAQ_STATUSES)[number];

const text = (min: number, max: number) =>
  z.string({ error: INVALID }).trim().min(min, { error: INVALID }).max(max, { error: INVALID });
const faqId = adminId;
const pageInput = {
  cursor: adminPageInput.cursor,
  limit: z
    .number({ error: INVALID })
    .int({ error: INVALID })
    .min(1, { error: INVALID })
    .max(FAQ_PAGE_SIZE_MAX, { error: INVALID })
    .default(FAQ_PAGE_SIZE_DEFAULT),
};
const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() }).strict();

// ---------------------------------------------------------------------------------------------
// Öğrenci: benzer SSS + talep gönderme + kendi talepleri
// ---------------------------------------------------------------------------------------------

export const suggestSimilarFaqsSchema = z
  .object({ text: text(FAQ_QUESTION_MIN, FAQ_QUESTION_MAX) })
  .strict();
export type SuggestSimilarFaqsInput = z.input<typeof suggestSimilarFaqsSchema>;

export const faqSuggestionSchema = z.object({ id: z.string(), question: z.string() }).strict();
export type FaqSuggestion = z.infer<typeof faqSuggestionSchema>;
export const faqSuggestionsSchema = z.array(faqSuggestionSchema).max(FAQ_SIMILAR_LIMIT);

/**
 * `similarAcknowledged`: kullanıcı benzer SSS'leri gördü ve yine de göndermek istiyor. Benzer SSS varken `false` ile
 * gönderim `FAQ_SIMILAR_EXISTS` ile reddedilir (ekran önerileri gösterir, onay alınca `true` ile yeniden gönderir).
 * Soru e-posta/telefon biçimi içeremez (`FAQ_TEXT_PERSONAL_DATA`). Hız sınırı: kullanıcı başına günde 3 (`RATE_LIMITED`).
 */
export const submitFaqRequestSchema = z
  .object({
    question: text(FAQ_QUESTION_MIN, FAQ_QUESTION_MAX),
    similarAcknowledged: z.boolean({ error: INVALID }).default(false),
  })
  .strict();
export type SubmitFaqRequestInput = z.input<typeof submitFaqRequestSchema>;
export const submitFaqRequestOutputSchema = z.object({ requestId: z.string() }).strict();
export type SubmitFaqRequestOutput = z.infer<typeof submitFaqRequestOutputSchema>;

export const listMyFaqRequestsSchema = z.object({ ...pageInput }).strict();
export type ListMyFaqRequestsInput = z.input<typeof listMyFaqRequestsSchema>;

/** Yalnız sahibine: kendi sorusu ve kararı. `decisionNote`: ret gerekçesi / yönlendirme notu (moderatörün yazdığı). */
export const myFaqRequestViewSchema = z
  .object({
    id: z.string(),
    question: z.string(),
    status: z.enum(FAQ_STATUSES),
    createdAt: z.date(),
    decidedAt: z.date().nullable(),
    decisionNote: z.string().nullable(),
    /** `PUBLISHED`: yayınlanan SSS kaydı (bağlantı için). */
    faqItemId: z.string().nullable(),
    /** `REDIRECTED`: mentor dizini bağlantısı (`FAQ_MENTOR_DIRECTORY_HREF`); diğer durumlarda `null`. */
    directoryHref: z.literal(FAQ_MENTOR_DIRECTORY_HREF).nullable(),
  })
  .strict();
export type MyFaqRequestView = z.infer<typeof myFaqRequestViewSchema>;
export const myFaqRequestPageSchema = pageOf(myFaqRequestViewSchema);
export type MyFaqRequestPage = z.infer<typeof myFaqRequestPageSchema>;

// ---------------------------------------------------------------------------------------------
// Mentor: açık talepler ve cevap
// ---------------------------------------------------------------------------------------------

export const listFaqRequestsForMentorSchema = z
  .object({ onlyUnanswered: z.boolean({ error: INVALID }).default(false), ...pageInput })
  .strict();
export type ListFaqRequestsForMentorInput = z.input<typeof listFaqRequestsForMentorSchema>;

/** Soran kimliği YOKTUR. Mentor yalnız kendi cevabını görür (diğer mentorların cevabı görünmez). */
export const mentorFaqRequestViewSchema = z
  .object({
    id: z.string(),
    question: z.string(),
    createdAt: z.date(),
    myAnswer: z
      .object({ id: z.string(), body: z.string(), updatedAt: z.date() })
      .strict()
      .nullable(),
  })
  .strict();
export type MentorFaqRequestView = z.infer<typeof mentorFaqRequestViewSchema>;
export const mentorFaqRequestPageSchema = pageOf(mentorFaqRequestViewSchema);
export type MentorFaqRequestPage = z.infer<typeof mentorFaqRequestPageSchema>;

/** Talep açıkken aynı mentor cevabını günceller (talep başına tek cevap). Kendi talebine cevap yazılamaz. */
export const answerFaqRequestSchema = z
  .object({ requestId: faqId, body: text(FAQ_ANSWER_MIN, FAQ_ANSWER_MAX) })
  .strict();
export type AnswerFaqRequestInput = z.input<typeof answerFaqRequestSchema>;
export const answerFaqRequestOutputSchema = z.object({ answerId: z.string() }).strict();
export type AnswerFaqRequestOutput = z.infer<typeof answerFaqRequestOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Moderatör: kuyruk ve karar
// ---------------------------------------------------------------------------------------------

export const listFaqModerationQueueSchema = z.object({ ...pageInput }).strict();
export type ListFaqModerationQueueInput = z.input<typeof listFaqModerationQueueSchema>;

/** Kimliksiz: soran da cevap yazanlar da görünmez; cevaplar yalnız kimlik ve metin. */
export const faqModerationItemSchema = z
  .object({
    id: z.string(),
    question: z.string(),
    createdAt: z.date(),
    answers: z.array(z.object({ id: z.string(), body: z.string() }).strict()),
  })
  .strict();
export type FaqModerationItem = z.infer<typeof faqModerationItemSchema>;
export const faqModerationPageSchema = pageOf(faqModerationItemSchema);
export type FaqModerationPage = z.infer<typeof faqModerationPageSchema>;

/**
 * Yayın: moderatör seçilen cevabı ve soruyu DÜZENLEYEREK gönderir (yayınlanan metin budur). Yayın metni soran ve bütün
 * cevap yazanların adını/soyadını ve e-posta/telefon biçimini içeremez → `FAQ_IDENTITY_LEAK`. Seçilen cevap bu talebe
 * ait olmalıdır. Puanlar yayınla birlikte yazılır (soran 2, seçilen 5, seçilmeyen cevap yazanlara 1; tek kez).
 */
export const publishFaqSchema = z
  .object({
    requestId: faqId,
    selectedAnswerId: faqId,
    question: text(FAQ_QUESTION_MIN, FAQ_QUESTION_MAX),
    answer: text(FAQ_ANSWER_MIN, FAQ_ANSWER_MAX),
  })
  .strict();
export type PublishFaqInput = z.input<typeof publishFaqSchema>;
export const publishFaqOutputSchema = z.object({ faqItemId: z.string() }).strict();
export type PublishFaqOutput = z.infer<typeof publishFaqOutputSchema>;

/** Gerekçe soran öğrenciye gösterilir (kişisel veri içeremez; işlem kaydına da yazılır). */
export const rejectFaqSchema = z.object({ requestId: faqId, reason: adminReason }).strict();
export type RejectFaqInput = z.input<typeof rejectFaqSchema>;
/** Kişisel/tek seferlik soru: öğrenci mentor dizinine yönlendirilir; not öğrenciye gösterilir. */
export const redirectFaqSchema = z.object({ requestId: faqId, note: adminReason }).strict();
export type RedirectFaqInput = z.input<typeof redirectFaqSchema>;
export const decideFaqOutputSchema = z
  .object({ requestId: z.string(), status: z.enum(['REJECTED', 'REDIRECTED']) })
  .strict();
export type DecideFaqOutput = z.infer<typeof decideFaqOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Herkese (doğrulanmış üye): SSS sayfası ve araması
// ---------------------------------------------------------------------------------------------

export const FAQ_SEARCH_MIN = 2;
export const FAQ_SEARCH_MAX = 100;
export const searchFaqSchema = z
  .object({
    /** Serbest metin (Türkçe tam metin + yazım hatası toleransı); yoksa en yeniler. Sorgu metni loglanmaz. */
    q: text(FAQ_SEARCH_MIN, FAQ_SEARCH_MAX).optional(),
    page: z.number({ error: INVALID }).int({ error: INVALID }).min(1).max(200).default(1),
    pageSize: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1)
      .max(FAQ_PAGE_SIZE_MAX)
      .default(FAQ_PAGE_SIZE_DEFAULT),
  })
  .strict();
export type SearchFaqInput = z.input<typeof searchFaqSchema>;

/** Kimliksiz çıktı: yalnız soru, cevap ve yayın tarihi. */
export const faqItemViewSchema = z
  .object({ id: z.string(), question: z.string(), answer: z.string(), publishedAt: z.date() })
  .strict();
export type FaqItemView = z.infer<typeof faqItemViewSchema>;
export const faqSearchPageSchema = z
  .object({
    items: z.array(faqItemViewSchema),
    total: z.number().int().min(0),
    page: z.number().int(),
    pageSize: z.number().int(),
  })
  .strict();
export type FaqSearchPage = z.infer<typeof faqSearchPageSchema>;

export const getFaqItemSchema = z.object({ id: faqId }).strict();
export type GetFaqItemInput = z.input<typeof getFaqItemSchema>;

// ---------------------------------------------------------------------------------------------
// Erişim ve hata kodları (ekran ipucu; asıl denetim sunucuda)
// ---------------------------------------------------------------------------------------------

export const FAQ_ACTION_ACCESS = {
  suggestSimilarFaqs: 'STUDENT',
  submitFaqRequest: 'STUDENT',
  listMyFaqRequests: 'STUDENT',
  listFaqRequestsForMentor: 'MENTOR',
  answerFaqRequest: 'MENTOR',
  listFaqModerationQueue: 'MODERATOR',
  publishFaq: 'MODERATOR',
  rejectFaq: 'MODERATOR',
  redirectFaq: 'MODERATOR',
  searchFaq: 'VERIFIED_MEMBER',
  getFaqItem: 'VERIFIED_MEMBER',
} as const satisfies Record<string, 'STUDENT' | 'MENTOR' | 'MODERATOR' | 'VERIFIED_MEMBER'>;
export type FaqActionName = keyof typeof FAQ_ACTION_ACCESS;

const AUTH_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'CONSENT_REQUIRED',
] as const satisfies readonly ErrorCode[];

export const FAQ_ACTION_ERRORS = {
  suggestSimilarFaqs: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  submitFaqRequest: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'RATE_LIMITED',
    'FAQ_SIMILAR_EXISTS',
    'FAQ_TEXT_PERSONAL_DATA',
  ],
  listMyFaqRequests: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  listFaqRequestsForMentor: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  answerFaqRequest: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'FAQ_REQUEST_CLOSED',
    'FAQ_OWN_REQUEST',
    'FAQ_TEXT_PERSONAL_DATA',
  ],
  listFaqModerationQueue: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  publishFaq: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'FAQ_REQUEST_CLOSED',
    'FAQ_IDENTITY_LEAK',
  ],
  rejectFaq: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'AUDIT_REASON_REQUIRED',
    'AUDIT_REASON_INVALID',
    'RESOURCE_NOT_FOUND',
    'FAQ_REQUEST_CLOSED',
  ],
  redirectFaq: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'AUDIT_REASON_REQUIRED',
    'AUDIT_REASON_INVALID',
    'RESOURCE_NOT_FOUND',
    'FAQ_REQUEST_CLOSED',
  ],
  searchFaq: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  getFaqItem: [...AUTH_ERRORS, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
} as const satisfies Record<FaqActionName, readonly ErrorCode[]>;
