import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

/**
 * Uygulama içi bildirim kutusu sözleşmesi (P2-05). Yalnız OTURUMDAKİ kullanıcının kendi bildirimleri: kimlik istemciden alınmaz,
 * okundu işaretleme kimlikleri sunucuda sahibine göre yeniden süzülür. Bildirim kişisel veri taşımaz; satır metni ve bağlantısı
 * `kind` + `refId`'den sunucu kataloğuyla kurulur.
 */
export const INBOX_CATEGORIES = [
  'job',
  'appointment',
  'experience',
  'contact',
  'faq',
  'cv',
  'referral',
  'calendar',
] as const;

/** Bildirim türleri (kapalı liste). Katalog (`server/rules/inbox`) ve metinler (`inbox.kinds.<tür>`) bu listeyle birebir eşleşir. */
export const INBOX_KIND_IDS = [
  'jobMatchPosting',
  'jobPostingPublished',
  'jobPostingRejected',
  'jobPostingExpired',
  'moderationApproved',
  'moderationRejected',
  'invitation',
  'contact',
  'faqPublished',
  'faqRejected',
  'faqRedirected',
  'faqAnswerPublished',
  'referralUpdated',
  'appointmentRequested',
  'appointmentConfirmed',
  'appointmentDeclined',
  'appointmentCancelled',
  'appointmentExpired',
  'appointmentReminder',
  'appointmentLinkNeeded',
  'appointmentLinkAdded',
  'cvReviewRequested',
  'cvReviewAnswered',
  'cvReviewExpired',
  'applicationWindowReminder',
] as const;
export type InboxKindId = (typeof INBOX_KIND_IDS)[number];

export const inboxGroupSchema = z
  .object({
    /** Gün + tür; aynı tür ve aynı İstanbul gününün bildirimleri tek satırdır. */
    key: z.string().min(1),
    kind: z.enum(INBOX_KIND_IDS),
    category: z.enum(INBOX_CATEGORIES),
    /** İstanbul takvim günü (`YYYY-MM-DD`). */
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    count: z.number().int().min(1),
    unread: z.number().int().min(0),
    /** Okundu işaretlemede kullanılacak kayıt kimlikleri. */
    ids: z.array(z.string().min(1)).min(1),
    latestAt: z.date(),
    /** Sunucuda kurulan site içi bağlantı (`/` ile başlar). */
    href: z.string().startsWith('/'),
  })
  .strict();
export type InboxGroupView = z.infer<typeof inboxGroupSchema>;

export const inboxPageSchema = z
  .object({
    groups: z.array(inboxGroupSchema),
    /** Daha eski günler varsa bir sonraki sayfa için gün imleci; yoksa `null`. */
    nextCursor: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    /** Okunmamış toplam (üst sınır `INBOX_UNREAD_CAP`). */
    unread: z.number().int().min(0),
  })
  .strict();
export type InboxPage = z.infer<typeof inboxPageSchema>;

/** Rozet ve "hepsini okundu yap" için okunmamış sayısının üst sınırı ("99+" gösterilir). */
export const INBOX_UNREAD_CAP = 100;
export const INBOX_MARK_MAX_IDS = 200;

export const listInboxInputSchema = z
  .object({
    /** Bu günden ESKİ günler istenir (önceki sayfanın `nextCursor` değeri). */
    cursor: z.iso.date({ error: 'VALIDATION_INVALID' }).optional(),
  })
  .strict();
export type ListInboxInput = z.input<typeof listInboxInputSchema>;

export const markInboxReadInputSchema = z
  .object({
    ids: z
      .array(z.string({ error: 'VALIDATION_INVALID' }).min(1).max(64))
      .min(1)
      .max(INBOX_MARK_MAX_IDS),
  })
  .strict();
export type MarkInboxReadInput = z.input<typeof markInboxReadInputSchema>;

export const INBOX_ACTION_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'CONSENT_REQUIRED',
  'VALIDATION_INVALID',
] as const satisfies readonly ErrorCode[];
