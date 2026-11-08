import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { adminId } from './admin';
import { sendContactRequestSchema } from './contact-request';
import { CONTACT_FIELDS } from './privacy';

/**
 * Ters yönlü arama ("staj arıyorum"; P2-06, docs/faz2-plan.md, D20/D28/D7/K-07) sözleşmesi. Servis (W1) ve ekranlar (W2) paylaşır;
 * DEĞİŞTİRMEZLER (değişiklik `ORTAK DOSYA İSTEĞİ`).
 *
 * Akış: öğrenci `JOB_SEEKER_VISIBILITY` rızasını verir ve "staj arıyorum"u açar → doğrulanmış ve "işe alım yapıyorum" beyanı vermiş
 * MEZUN (öğrenci/akademisyen/beyansız mezun yapamaz) bölüm, ilgi etiketi ve dönem süzgeciyle aday kartlarını arar → kart üzerinden
 * iletişim talebi gönderir (kişiyi mezun SEÇMEZ; sunucu opak kimliği çözer) → öğrenci mevcut iletişim talebi akışıyla onaylar/reddeder.
 *
 * Gizlilik (sunucuda zorlanır; testle korunur):
 *  - Aday kartı BEYAZ LİSTEDİR: bölüm, sınıf, ilgi etiketleri, (kişisel veri biçimi ayıklanmış) başlık satırı, dönem. Ad, fotoğraf,
 *    e-posta, telefon, kullanıcı kimliği ve üyelik/zaman izi YOKTUR. Kartın kimliği (`ref`) OPAKTIR: kullanıcı kimliği değildir,
 *    rastgeledir, görünürlük kapanınca silinir ve açılınca yenilenir (eski bağlantı geçersiz olur).
 *  - Görünürlük, rıza ve bayrak birlikte aranır ve SORGU ANINDA denetlenir: rıza geri alındığı anda kart hiçbir yanıtta yoktur.
 *    Geri alınınca bekleyen talepler kapanır.
 *  - K-07: yalnız mezunun doğrulanmış üyeliklerinin üniversitesindeki öğrenciler. Aynı üniversite dışında kimse görünmez.
 *  - Talep eden mezun, öğrencinin adını/kimliğini yalnız talep `APPROVED` olunca görür (`ContactRequest.source = SEEKER_PROFILE`,
 *    giden listede `counterpart = null` + `origin`; P2-04 D7 deseni).
 *  - Öğrenci "kartım kaç kez gösterildi" sayısını görür; kimin baktığı tutulmaz.
 *  - Hız sınırı: mezun başına günde 50 aday kartı, ayda 20 talep. Her arama `JOB_SEEKER_SEARCH` olayıdır (yalnız sonuç kovası).
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

// ---------------------------------------------------------------------------------------------
// Katalog ve sınırlar
// ---------------------------------------------------------------------------------------------

/** Mezun başına günde en çok bu kadar aday kartı döner (sayfalamayla aşılamaz). */
export const SEEKER_CARDS_PER_DAY = 50;
/** Mezun başına 30 günde en çok bu kadar iletişim talebi (aday kartı üzerinden). */
export const SEEKER_CONTACTS_PER_MONTH = 20;
export const SEEKER_PAGE_SIZE_DEFAULT = 10;
export const SEEKER_PAGE_SIZE_MAX = 20;
export const SEEKER_TAGS_MAX = 5;
/** Kartta gösterilen en çok ilgi etiketi. */
export const SEEKER_CARD_TAGS_MAX = 8;
export const SEEKER_HEADLINE_MAX = 120;
export const SEEKER_TERM_YEAR_MIN = 2020;
export const SEEKER_TERM_YEAR_MAX = 2100;
/** `Profile.seekerRef` biçimi: rastgele, tahmin edilemez (UUIDv4 + son ek yok); kullanıcı kimliğiyle ilgisi yoktur. */
export const SEEKER_REF_PATTERN = /^[a-z0-9-]{16,64}$/;

export const SEEKER_TERM_SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'] as const;
export type SeekerTermSeason = (typeof SEEKER_TERM_SEASONS)[number];
export const SEEKER_TAG_KINDS = ['INTEREST', 'SKILL', 'GOAL'] as const;
export type SeekerTagKind = (typeof SEEKER_TAG_KINDS)[number];

/** Ekran bağlantıları (ekran adımı bunları kurar). */
export const SEEKER_SETTINGS_HREF = '/hesap/staj-ariyorum';
export const SEEKER_SEARCH_HREF = '/adaylar';

const deptId = adminId;
const seekerRef = z.string({ error: INVALID }).trim().regex(SEEKER_REF_PATTERN, { error: INVALID });
const termYear = z
  .number({ error: INVALID })
  .int({ error: INVALID })
  .min(SEEKER_TERM_YEAR_MIN, { error: INVALID })
  .max(SEEKER_TERM_YEAR_MAX, { error: INVALID });
const termSeason = z.enum(SEEKER_TERM_SEASONS, { error: INVALID });

// ---------------------------------------------------------------------------------------------
// Öğrenci: aday ayarları (görünürlük, dönem, önizleme, sayaç)
// ---------------------------------------------------------------------------------------------

export const getMySeekerSettingsSchema = z.object({}).strict();
export type GetMySeekerSettingsInput = z.input<typeof getMySeekerSettingsSchema>;

/** Kartta görünen etiket: tür + kararlı anahtar (görünen Türkçe karşılık mesaj kataloğundadır). */
export const seekerTagSchema = z
  .object({ kind: z.enum(SEEKER_TAG_KINDS), slug: z.string() })
  .strict();
export type SeekerTag = z.infer<typeof seekerTagSchema>;

/**
 * Sınıf bilgisi (giriş yılından hesaplanır; D4). `GRADE`: `grade` dolu (1+), `extended`: normal süreyi aştı. Yazı çıktısı ekranın işidir.
 */
export const seekerClassSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('GRADE'), grade: z.number().int().min(1), extended: z.boolean() })
    .strict(),
  z.object({ kind: z.literal('PREPARATORY') }).strict(),
  z.object({ kind: z.literal('UNKNOWN') }).strict(),
]);
export type SeekerClass = z.infer<typeof seekerClassSchema>;

/**
 * Aday kartı (BEYAZ LİSTE). `ref` opaktır (kullanıcı kimliği değildir). `headline`: profildeki başlık satırı; e-posta/telefon/kimlik
 * numarası biçimi içeriyorsa HİÇ döndürülmez (`null`) ve en çok 120 karakter. Ad/fotoğraf/e-posta/telefon/kullanıcı kimliği alanı yoktur.
 */
export const seekerCardSchema = z
  .object({
    ref: z.string(),
    departmentId: z.string(),
    departmentName: z.string(),
    classStanding: seekerClassSchema,
    headline: z.string().max(SEEKER_HEADLINE_MAX).nullable(),
    tags: z.array(seekerTagSchema).max(SEEKER_CARD_TAGS_MAX),
    termYear: z.number().int().nullable(),
    termSeason: z.enum(SEEKER_TERM_SEASONS).nullable(),
  })
  .strict();
export type SeekerCard = z.infer<typeof seekerCardSchema>;

/**
 * Öğrencinin ayarları. `consent`: `JOB_SEEKER_VISIBILITY` rızasının güncel durumu (rıza `recordConsents` ile verilir/geri alınır; sürüm
 * `CURRENT_CONSENT_VERSIONS`). `visible`: kart şu an aramalarda görünüyor mu (rıza AND bayrak AND doğrulanmış öğrenci). `preview`:
 * "mezunlar seni böyle görür" (kartın aynısı; `ref` yoktur). `viewCount`: kartın gösterilme sayısı (kim baktığı yok).
 */
export const seekerSettingsSchema = z
  .object({
    seekingInternship: z.boolean(),
    termYear: z.number().int().nullable(),
    termSeason: z.enum(SEEKER_TERM_SEASONS).nullable(),
    consent: z
      .object({ granted: z.boolean(), currentVersion: z.string(), needsAction: z.boolean() })
      .strict(),
    visible: z.boolean(),
    viewCount: z.number().int().min(0),
    preview: seekerCardSchema.omit({ ref: true }).nullable(),
  })
  .strict();
export type SeekerSettings = z.infer<typeof seekerSettingsSchema>;

/**
 * Ayarları kaydeder. `seekingInternship: true` için `JOB_SEEKER_VISIBILITY` rızası güncel sürümde VERİLMİŞ olmalıdır
 * (`SEEKER_CONSENT_REQUIRED`; ekran önce `recordConsents` çağırır). Dönem yıl+mevsim ikilisidir (biri tek başına olamaz). Kapatmak her zaman
 * serbesttir: kart hemen kalkar, `ref` silinir, bekleyen talepler kapanır.
 */
export const setSeekerSettingsSchema = z
  .object({
    seekingInternship: z.boolean({ error: INVALID }),
    termYear: termYear.nullable().optional(),
    termSeason: termSeason.nullable().optional(),
  })
  .strict()
  .refine((value) => (value.termYear == null) === (value.termSeason == null), {
    error: 'SEEKER_TERM_INVALID' satisfies ErrorCode,
    path: ['termYear'],
  });
export type SetSeekerSettingsInput = z.input<typeof setSeekerSettingsSchema>;

// ---------------------------------------------------------------------------------------------
// Mezun: "işe alım yapıyorum" beyanı
// ---------------------------------------------------------------------------------------------

export const getMyHiringDeclarationSchema = z.object({}).strict();
export type GetMyHiringDeclarationInput = z.input<typeof getMyHiringDeclarationSchema>;
/** Beyan: doğrulanmış ve etkin üyelikli MEZUN için; her an kapatılır (kapatınca arama kapanır). */
export const hiringDeclarationSchema = z
  .object({ hiring: z.boolean(), declaredAt: z.date().nullable() })
  .strict();
export type HiringDeclaration = z.infer<typeof hiringDeclarationSchema>;
export const setHiringDeclarationSchema = z
  .object({ hiring: z.boolean({ error: INVALID }) })
  .strict();
export type SetHiringDeclarationInput = z.input<typeof setHiringDeclarationSchema>;

// ---------------------------------------------------------------------------------------------
// Mezun: aday arama
// ---------------------------------------------------------------------------------------------

/**
 * Arama. Yetki yalnız doğrulanmış etkin üyelikli `ALUMNI` + beyan (`SEEKER_HIRING_DECLARATION_REQUIRED`). `departmentId`: adayın
 * bölümü; `tags`: ilgi etiketi anahtarları (hepsi aranır, en çok 5); `termYear`/`termSeason`: adayın hedef dönemi. Günlük 50 kart
 * sınırı aşılırsa `RATE_LIMITED` (sınır sayfalamayla aşılamaz). Sonuç yalnız beyaz liste kartlarıdır.
 */
export const searchSeekersSchema = z
  .object({
    departmentId: deptId.optional(),
    tags: z
      .array(
        z.string({ error: INVALID }).trim().min(1, { error: INVALID }).max(64, { error: INVALID }),
        {
          error: INVALID,
        },
      )
      .max(SEEKER_TAGS_MAX, { error: INVALID })
      .optional(),
    termYear: termYear.optional(),
    termSeason: termSeason.optional(),
    page: z.number({ error: INVALID }).int({ error: INVALID }).min(1).max(100).default(1),
    pageSize: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1)
      .max(SEEKER_PAGE_SIZE_MAX)
      .default(SEEKER_PAGE_SIZE_DEFAULT),
  })
  .strict();
export type SearchSeekersInput = z.input<typeof searchSeekersSchema>;
export const seekerPageSchema = z
  .object({
    items: z.array(seekerCardSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    /** Bugün (İstanbul) kalan kart hakkı. */
    remainingCardsToday: z.number().int().min(0),
  })
  .strict();
export type SeekerPage = z.infer<typeof seekerPageSchema>;

// ---------------------------------------------------------------------------------------------
// Mezun: kart üzerinden iletişim talebi (D7)
// ---------------------------------------------------------------------------------------------

/**
 * Önizleme: girdi opak `ref`; çıktıda adayın kartı (ad/kimlik yok) ve onayla açılabilecek alanlar (en az bir). Talep edilemeyen her
 * durum (kart yok/kapalı/kapsam dışı/rıza geri alınmış, yetkisiz, kendi kartı, alan yok) TEK genel yanıta düşer. Hız sınırlı.
 */
export const previewSeekerContactSchema = z.object({ ref: seekerRef }).strict();
export type PreviewSeekerContactInput = z.input<typeof previewSeekerContactSchema>;
export const seekerContactPreviewSchema = z.discriminatedUnion('canRequest', [
  z
    .object({
      canRequest: z.literal(true),
      card: seekerCardSchema.omit({ ref: true }),
      requestableFields: z.array(z.enum(CONTACT_FIELDS)).min(1),
    })
    .strict(),
  z
    .object({
      canRequest: z.literal(false),
      card: z.null(),
      requestableFields: z.array(z.enum(CONTACT_FIELDS)).length(0),
    })
    .strict(),
]);
export type SeekerContactPreview = z.infer<typeof seekerContactPreviewSchema>;
export const SEEKER_CONTACT_NOT_REQUESTABLE: SeekerContactPreview = {
  canRequest: false,
  card: null,
  requestableFields: [],
};

/**
 * Adaya iletişim talebi (mevcut `ContactRequest` kaydı ve bildirimi; hedef sunucuda `ref`'ten çözülür; `source = SEEKER_PROFILE`).
 * Aday adı/kimliği çıktıda yoktur; talep eden bunu yalnız onayda görür. Ayda 20 talep sınırı (`RATE_LIMITED`). Talep notu en çok 500 karakter.
 */
export const requestSeekerContactSchema = z
  .object({
    ref: seekerRef,
    fields: sendContactRequestSchema.shape.fields,
    message: sendContactRequestSchema.shape.message,
  })
  .strict();
export type RequestSeekerContactInput = z.input<typeof requestSeekerContactSchema>;
export const requestSeekerContactOutputSchema = z
  .object({ requestId: z.string(), status: z.literal('PENDING') })
  .strict();
export type RequestSeekerContactOutput = z.infer<typeof requestSeekerContactOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları ve erişim
// ---------------------------------------------------------------------------------------------

/** Erişim: `STUDENT` doğrulanmış etkin üyelikli öğrenci; `HIRING_ALUMNI` doğrulanmış etkin mezun (beyan ayrıca denetlenir); `ALUMNI` beyan gerekmez. */
export const SEEKER_ACTION_ACCESS = {
  getMySeekerSettings: 'STUDENT',
  setSeekerSettings: 'STUDENT',
  getMyHiringDeclaration: 'ALUMNI',
  setHiringDeclaration: 'ALUMNI',
  searchSeekers: 'HIRING_ALUMNI',
  previewSeekerContact: 'HIRING_ALUMNI',
  requestSeekerContact: 'HIRING_ALUMNI',
} as const satisfies Record<string, 'STUDENT' | 'ALUMNI' | 'HIRING_ALUMNI'>;
export type SeekerActionName = keyof typeof SEEKER_ACTION_ACCESS;

const AUTH_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'CONSENT_REQUIRED',
] as const satisfies readonly ErrorCode[];

export const SEEKER_ACTION_ERRORS = {
  getMySeekerSettings: [...AUTH_ERRORS],
  setSeekerSettings: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'SEEKER_CONSENT_REQUIRED',
    'SEEKER_TERM_INVALID',
  ],
  getMyHiringDeclaration: [...AUTH_ERRORS],
  setHiringDeclaration: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  searchSeekers: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'SEEKER_HIRING_DECLARATION_REQUIRED',
    'RATE_LIMITED',
  ],
  previewSeekerContact: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'SEEKER_HIRING_DECLARATION_REQUIRED',
    'RATE_LIMITED',
  ],
  requestSeekerContact: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'SEEKER_HIRING_DECLARATION_REQUIRED',
    'RESOURCE_NOT_FOUND',
    'RATE_LIMITED',
    'CONTACT_REQUEST_ALREADY_OPEN',
    'CONTACT_FIELD_NOT_REQUESTABLE',
  ],
} as const satisfies Record<SeekerActionName, readonly ErrorCode[]>;
