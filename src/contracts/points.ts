import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { adminId, adminPageInput, adminReason } from './admin';

/**
 * Puan motoru sözleşmesi (P1-16; docs/architecture.md "Puan motoru ve hile önleme", K-10, K-11). Servis (W1) ve ekranlar
 * (W2: profilde katkı puanı + geçmiş; sistem yöneticisi kural + şüphe ekranı) paylaşır; DEĞİŞTİRMEZLER
 * (değişiklik `ORTAK DOSYA İSTEĞİ`).
 *
 * İlkeler (hepsi sunucuda zorlanır):
 *  - Puan yalnız DOĞRULANMIŞ olaydan doğar: deneyim moderasyon onayı, iki tarafın "gerçekleşti" dediği görüşme
 *    (`Appointment.COMPLETED`), öğrencinin "faydalı" dediği CV incelemesi. SSS P1-17'de `awardPoint` ile bağlanır.
 *  - Aynı olay iki kez puan üretmez: `(userId, action, sourceType, sourceId)` benzersizdir.
 *  - Çıktıda KAYNAK KİMLİĞİ YOKTUR (deneyim/randevu/CV kimliği). Böylece anonim deneyimin puanı yazarla ilişkilendirilen
 *    bir içerik bağı sızdırmaz; geçmiş yalnız eylem türü + puan + durum gösterir. Karşı taraf kimliği de çıkmaz.
 *  - Katkı puanı ve geçmişi yalnız sahibine görünür. Yönetici ekranları yalnız SİSTEM yöneticisine açıktır.
 *  - Kural değişikliği yalnız gelecekteki kayıtları etkiler (kayıt, o anki `basePoints`'i saklar).
 *  - Yönetici eylemleri (`POINT_RULE_CHANGE`, `POINTS_REVOKE`, `SUSPICION_DECIDE`) `recordAdminAction` ile AYNI işlemde
 *    yazılır; gerekçe kişisel veri içeremez. Şüphe işareti CEZA DEĞİLDİR: onaylanana kadar yalnız bekleyen puan kesinleşmez.
 *  - Puan = taban puan × çarpan (yüzde, tam sayı) ; kesirler aşağı yuvarlanır (`floor`).
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

// ---------------------------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------------------------

/** Puan eylemleri (K-11 tablosu). İlan P2-04'te eklendi; referans (P2-03) ve etkinlik (P2-12) kendi adımlarında eklenir. */
export const POINT_ACTIONS = [
  'EXPERIENCE_PUBLISHED',
  'FAQ_QUESTION_PUBLISHED',
  'FAQ_ANSWER_SELECTED',
  'FAQ_ANSWER_PARTICIPATION',
  'JOB_POSTING_PUBLISHED',
  'CV_REVIEW_HELPFUL',
  'SESSION_ONLINE',
  'SESSION_IN_PERSON',
] as const;
export type PointAction = (typeof POINT_ACTIONS)[number];

/** Puanı doğuran kaynağın türü (yalnız sunucuda; çıktıya girmez). */
export const POINT_SOURCE_TYPES = [
  'EXPERIENCE',
  'APPOINTMENT',
  'CV_REVIEW',
  'FAQ_REQUEST',
  'FAQ_ANSWER',
  'JOB_POSTING',
] as const;
export type PointSourceType = (typeof POINT_SOURCE_TYPES)[number];

/** `PENDING`: gecikme süresi dolmadı (yönetici iptal edebilir). `FINAL`: sayılır. `REVOKED`: geri alındı. */
export const POINT_STATUSES = ['PENDING', 'FINAL', 'REVOKED'] as const;
export type PointStatus = (typeof POINT_STATUSES)[number];

/** Kullanıcıya gösterilen geri alma nedeni; serbest gerekçe yalnız işlem kaydındadır. */
export const POINT_REVOKE_REASONS = [
  'ADMIN_CANCEL',
  'FRAUD_CONFIRMED',
  'POSTING_WITHDRAWN',
] as const;
export type PointRevokeReason = (typeof POINT_REVOKE_REASONS)[number];

/** Görüşme eylemleri: ikili tavanı ve azalan çarpan yalnız bunlara uygulanır. */
export const SESSION_POINT_ACTIONS = [
  'SESSION_ONLINE',
  'SESSION_IN_PERSON',
] as const satisfies readonly PointAction[];

export const BADGE_KINDS = ['FOUNDING_MEMBER'] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export const SUSPICION_RULES = ['BURST', 'SINGLE_COUNTERPART', 'SYNC_FEEDBACK'] as const;
export type SuspicionRule = (typeof SUSPICION_RULES)[number];
export const SUSPICION_STATUSES = ['OPEN', 'CONFIRMED', 'DISMISSED'] as const;
export type SuspicionStatus = (typeof SUSPICION_STATUSES)[number];
export const SUSPICION_DECISIONS = ['CONFIRM', 'DISMISS'] as const;
export type SuspicionDecision = (typeof SUSPICION_DECISIONS)[number];

/** Seed başlangıç tablosu (K-11). `delayDays` yalnız gecikmeli eylemde > 0. Seed yalnız EKSİK satırı ekler. */
export const DEFAULT_POINT_RULES: Readonly<
  Record<PointAction, { points: number; delayDays: number }>
> = {
  EXPERIENCE_PUBLISHED: { points: 5, delayDays: 0 },
  FAQ_QUESTION_PUBLISHED: { points: 2, delayDays: 0 },
  FAQ_ANSWER_SELECTED: { points: 5, delayDays: 0 },
  FAQ_ANSWER_PARTICIPATION: { points: 1, delayDays: 0 },
  /** İlan (P2-04, PM kararı): 5 puan, yayından 7 gün sonra kesinleşir; ayda en çok 3 ilan puan getirir (`rules/points`). */
  JOB_POSTING_PUBLISHED: { points: 5, delayDays: 7 },
  CV_REVIEW_HELPFUL: { points: 3, delayDays: 0 },
  SESSION_ONLINE: { points: 10, delayDays: 0 },
  SESSION_IN_PERSON: { points: 15, delayDays: 7 },
};

export const POINT_RULE_POINTS_MAX = 100;
export const POINT_RULE_DELAY_MAX_DAYS = 30;

// ---------------------------------------------------------------------------------------------
// Katılımcı: katkı puanı ve geçmiş (yalnız sahibi)
// ---------------------------------------------------------------------------------------------

export const POINT_HISTORY_PAGE_DEFAULT = 20;
export const POINT_HISTORY_PAGE_MAX = 50;

export const getMyContributionSchema = z
  .object({
    status: z.enum(POINT_STATUSES, { error: INVALID }).optional(),
    cursor: adminPageInput.cursor,
    limit: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1, { error: INVALID })
      .max(POINT_HISTORY_PAGE_MAX, { error: INVALID })
      .default(POINT_HISTORY_PAGE_DEFAULT),
  })
  .strict();
export type GetMyContributionInput = z.input<typeof getMyContributionSchema>;

export const pointEntryViewSchema = z
  .object({
    id: z.string(),
    action: z.enum(POINT_ACTIONS),
    basePoints: z.number().int().min(0),
    /** 100 / 50 / 25 / 0 (ikili tavanı ve azalan çarpan). */
    multiplierPercent: z.number().int().min(0).max(100),
    points: z.number().int().min(0),
    status: z.enum(POINT_STATUSES),
    createdAt: z.date(),
    /** Yalnız `PENDING`: puanın kesinleşeceği an. */
    finalizesAt: z.date().nullable(),
    revokedReason: z.enum(POINT_REVOKE_REASONS).nullable(),
  })
  .strict();
export type PointEntryView = z.infer<typeof pointEntryViewSchema>;

export const badgeViewSchema = z
  .object({ kind: z.enum(BADGE_KINDS), awardedAt: z.date() })
  .strict();
export type BadgeView = z.infer<typeof badgeViewSchema>;

export const pointSummarySchema = z
  .object({
    /** Yalnız `FINAL` kayıtların toplamı. */
    total: z.number().int().min(0),
    /** `PENDING` kayıtların toplamı (henüz sayılmaz). */
    pending: z.number().int().min(0),
    /** Geri alınmış rozetler dahil edilmez. */
    badges: z.array(badgeViewSchema),
  })
  .strict();
export type PointSummary = z.infer<typeof pointSummarySchema>;

export const pointEntryPageSchema = z
  .object({ items: z.array(pointEntryViewSchema), nextCursor: z.string().nullable() })
  .strict();
export type PointEntryPage = z.infer<typeof pointEntryPageSchema>;

export const contributionOverviewSchema = z
  .object({ summary: pointSummarySchema, history: pointEntryPageSchema })
  .strict();
export type ContributionOverview = z.infer<typeof contributionOverviewSchema>;

// ---------------------------------------------------------------------------------------------
// Sistem yöneticisi: kurallar, kayıtlar, iptal
// ---------------------------------------------------------------------------------------------

export const pointRuleViewSchema = z
  .object({
    action: z.enum(POINT_ACTIONS),
    points: z.number().int().min(0),
    delayDays: z.number().int().min(0),
    isActive: z.boolean(),
    updatedAt: z.date(),
  })
  .strict();
export type PointRuleView = z.infer<typeof pointRuleViewSchema>;

/** Kural değişikliği yalnız GELECEKTEKİ kayıtları etkiler; gerekçe işlem kaydına gider. */
export const updatePointRuleSchema = z
  .object({
    action: z.enum(POINT_ACTIONS, { error: INVALID }),
    points: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(0, { error: INVALID })
      .max(POINT_RULE_POINTS_MAX, { error: INVALID }),
    delayDays: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(0, { error: INVALID })
      .max(POINT_RULE_DELAY_MAX_DAYS, { error: INVALID }),
    isActive: z.boolean({ error: INVALID }),
    reason: adminReason,
  })
  .strict();
export type UpdatePointRuleInput = z.input<typeof updatePointRuleSchema>;

export const listPointEntriesSchema = z
  .object({
    userId: adminId,
    status: z.enum(POINT_STATUSES, { error: INVALID }).optional(),
    ...adminPageInput,
  })
  .strict();
export type ListPointEntriesInput = z.input<typeof listPointEntriesSchema>;

/** Geri alma/iptal: `PENDING` ise iptal, `FINAL` ise geri alma; ikisi de işlem kaydıyla ve geri döndürülemez. */
export const revokePointEntrySchema = z.object({ entryId: adminId, reason: adminReason }).strict();
export type RevokePointEntryInput = z.input<typeof revokePointEntrySchema>;
export const revokePointEntryOutputSchema = z
  .object({ entryId: z.string(), badgeRevoked: z.boolean() })
  .strict();
export type RevokePointEntryOutput = z.infer<typeof revokePointEntryOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Sistem yöneticisi: şüphe işaretleri
// ---------------------------------------------------------------------------------------------

export const listSuspicionFlagsSchema = z
  .object({
    status: z.enum(SUSPICION_STATUSES, { error: INVALID }).optional(),
    ...adminPageInput,
  })
  .strict();
export type ListSuspicionFlagsInput = z.input<typeof listSuspicionFlagsSchema>;

/** Açık işarete eklenen kanıt özetinin saklanan sınırları (sayaç sınırsız artar; özet ve tekrar anahtarı sınırlıdır). */
export const SUSPICION_RECENT_EVIDENCE_LIMIT = 5;
export const SUSPICION_SEEN_KEYS_LIMIT = 20;
export const recurrenceEvidenceSchema = z
  .object({ at: z.date(), entryCount: z.number().int().min(0), points: z.number().int().min(0) })
  .strict();
/** Veritabanında JSON olarak saklanan biçim (`at` ISO metin). */
export const storedRecurrenceEvidenceSchema = z
  .array(
    z
      .object({
        at: z.string(),
        entryCount: z.number().int().min(0),
        points: z.number().int().min(0),
      })
      .strict(),
  )
  .max(SUSPICION_RECENT_EVIDENCE_LIMIT);

/** Yalnız sayılar ve pencere; kişisel veri ve içerik yok. İşaretlenen kullanıcının adı ayrı alandadır. */
export const suspicionDetailsSchema = z
  .object({
    windowStart: z.date(),
    windowEnd: z.date(),
    entryCount: z.number().int().min(0),
    points: z.number().int().min(0),
    /** `SINGLE_COUNTERPART`: tek karşı tarafın puan payı (yüzde). */
    sharePercent: z.number().int().min(0).max(100).nullable(),
    /** `SYNC_FEEDBACK`: iki tarafın aynı dakikada yanıtladığı görüşme sayısı. */
    syncedCount: z.number().int().min(0).nullable(),
    /** İşaret açıkken aynı kural için görülen YENİ kanıt sayısı (yeni işaret açılmaz) ve son görülme. */
    recurrenceCount: z.number().int().min(0),
    lastSeenAt: z.date().nullable(),
    /** En çok 5 kanıt özeti (yeniden eskiye); yalnız sayılar. */
    recentEvidence: z.array(recurrenceEvidenceSchema).max(SUSPICION_RECENT_EVIDENCE_LIMIT),
  })
  .strict();
export type SuspicionDetails = z.infer<typeof suspicionDetailsSchema>;

export const suspicionFlagViewSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    displayName: z.string(),
    rule: z.enum(SUSPICION_RULES),
    status: z.enum(SUSPICION_STATUSES),
    details: suspicionDetailsSchema,
    createdAt: z.date(),
    decidedAt: z.date().nullable(),
  })
  .strict();
export type SuspicionFlagView = z.infer<typeof suspicionFlagViewSchema>;
export const suspicionFlagPageSchema = z
  .object({ items: z.array(suspicionFlagViewSchema), nextCursor: z.string().nullable() })
  .strict();
export type SuspicionFlagPage = z.infer<typeof suspicionFlagPageSchema>;

/** `CONFIRM`: işarete bağlı kayıtlar geri alınır (`FRAUD_CONFIRMED`) ve rozeti bu kayıtlardan gelen geri alınır. */
export const decideSuspicionSchema = z
  .object({
    flagId: adminId,
    decision: z.enum(SUSPICION_DECISIONS, { error: INVALID }),
    reason: adminReason,
  })
  .strict();
export type DecideSuspicionInput = z.input<typeof decideSuspicionSchema>;
export const decideSuspicionOutputSchema = z
  .object({
    flagId: z.string(),
    status: z.enum(['CONFIRMED', 'DISMISSED']),
    revokedCount: z.number().int().min(0),
  })
  .strict();
export type DecideSuspicionOutput = z.infer<typeof decideSuspicionOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Geriye dönük hesaplama (bir kez; `points.backfill`)
// ---------------------------------------------------------------------------------------------

/** İş kuyruğa alınır; sonuç eşzamansız. İki kez çalışmak sonucu değiştirmez (idempotent). */
export const requestPointBackfillSchema = z.object({}).strict();
export type RequestPointBackfillInput = z.input<typeof requestPointBackfillSchema>;
export const requestPointBackfillOutputSchema = z.object({ queued: z.boolean() }).strict();
export type RequestPointBackfillOutput = z.infer<typeof requestPointBackfillOutputSchema>;

// ---------------------------------------------------------------------------------------------
// Erişim ve hata kodları (ekran ipucu; asıl denetim sunucuda)
// ---------------------------------------------------------------------------------------------

export const POINT_ACTION_ACCESS = {
  getMyContribution: 'VERIFIED_MEMBER',
  listPointRules: 'SYSTEM_ONLY',
  updatePointRule: 'SYSTEM_ONLY',
  listPointEntries: 'SYSTEM_ONLY',
  revokePointEntry: 'SYSTEM_ONLY',
  listSuspicionFlags: 'SYSTEM_ONLY',
  decideSuspicion: 'SYSTEM_ONLY',
  requestPointBackfill: 'SYSTEM_ONLY',
} as const satisfies Record<string, 'VERIFIED_MEMBER' | 'SYSTEM_ONLY'>;
export type PointActionName = keyof typeof POINT_ACTION_ACCESS;

const AUTH_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'CONSENT_REQUIRED',
] as const satisfies readonly ErrorCode[];

export const POINTS_ACTION_ERRORS = {
  getMyContribution: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  listPointRules: [...AUTH_ERRORS],
  updatePointRule: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'AUDIT_REASON_REQUIRED',
    'RESOURCE_NOT_FOUND',
  ],
  listPointEntries: [...AUTH_ERRORS, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  revokePointEntry: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'AUDIT_REASON_REQUIRED',
    'RESOURCE_NOT_FOUND',
    'POINT_ALREADY_REVOKED',
  ],
  listSuspicionFlags: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
  decideSuspicion: [
    ...AUTH_ERRORS,
    'VALIDATION_INVALID',
    'AUDIT_REASON_REQUIRED',
    'RESOURCE_NOT_FOUND',
    'SUSPICION_ALREADY_DECIDED',
  ],
  requestPointBackfill: [...AUTH_ERRORS, 'POINT_BACKFILL_UNAVAILABLE'],
} as const satisfies Record<PointActionName, readonly ErrorCode[]>;
