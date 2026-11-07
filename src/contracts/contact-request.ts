import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { CONTACT_FIELDS } from './privacy';

/**
 * Kontrollü iletişim sözleşmesi (P1-03; D7, docs/security.md “KVKK”). Telefon/e-posta varsayılan gizlidir;
 * iletişim talebi onaylanınca İSTENEN alanlar YALNIZ talep edene açılır; hedef istediği an geri alır.
 *
 * Durumlar: `PENDING` → `APPROVED` | `REJECTED` (hedef) · `PENDING` → `WITHDRAWN` (talep eden) ·
 * `APPROVED` → `REVOKED` (hedef). Aynı ikili için aynı anda tek açık (bekleyen/onaylı) talep.
 *
 * Yanıtlarda karşı taraf yalnız `{ userId, name }` ile görünür; e-posta/telefon YALNIZ onaylı talepte,
 * yalnız talep edene ve yalnız görünürlük kuralının (`rules/visibility`) izin verdiği alanlarla döner.
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

export const CONTACT_REQUEST_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
  'REVOKED',
] as const;
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number];

export const CONTACT_MESSAGE_MAX = 500;
export const CONTACT_LIST_PAGE_SIZE_DEFAULT = 20;
export const CONTACT_LIST_PAGE_SIZE_MAX = 50;

const idSchema = z
  .string({ error: INVALID })
  .trim()
  .min(1, { error: INVALID })
  .max(64, { error: INVALID });

/** Boş/yalnız boşluk not yok sayılır (null); veritabanı CHECK'iyle aynı üst sınır. */
const messageSchema = z
  .string({ error: INVALID })
  .trim()
  .max(CONTACT_MESSAGE_MAX, { error: INVALID })
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

export const sendContactRequestSchema = z.object({
  targetUserId: idSchema,
  fields: z
    .array(z.enum(CONTACT_FIELDS, { error: INVALID }), { error: INVALID })
    .min(1, { error: INVALID })
    .max(CONTACT_FIELDS.length, { error: INVALID })
    .refine((list) => new Set(list).size === list.length, { error: INVALID }),
  message: messageSchema,
});
export type SendContactRequestInput = z.input<typeof sendContactRequestSchema>;

export const sendContactRequestOutputSchema = z.object({
  requestId: z.string(),
  status: z.literal('PENDING'),
});
export type SendContactRequestOutput = z.infer<typeof sendContactRequestOutputSchema>;

/** Hedef karar verir. Ret gerekçesi YOKTUR (talep edene neden söylenmez). */
export const respondToContactRequestSchema = z.object({
  requestId: idSchema,
  decision: z.enum(['APPROVE', 'REJECT'], { error: INVALID }),
});
export type RespondToContactRequestInput = z.input<typeof respondToContactRequestSchema>;

/** Talep eden bekleyen talebi geri çeker (`WITHDRAWN`) ya da hedef onayı geri alır (`REVOKED`). */
export const closeContactRequestSchema = z.object({ requestId: idSchema });
export type CloseContactRequestInput = z.input<typeof closeContactRequestSchema>;

export const contactRequestStatusOutputSchema = z.object({
  requestId: z.string(),
  status: z.enum(CONTACT_REQUEST_STATUSES),
});
export type ContactRequestStatusOutput = z.infer<typeof contactRequestStatusOutputSchema>;

export const listContactRequestsSchema = z.object({
  box: z.enum(['INCOMING', 'OUTGOING'], { error: INVALID }),
  status: z.enum(CONTACT_REQUEST_STATUSES, { error: INVALID }).optional(),
  cursor: z.string().min(1).max(200).optional(),
  limit: z
    .number({ error: INVALID })
    .int({ error: INVALID })
    .min(1, { error: INVALID })
    .max(CONTACT_LIST_PAGE_SIZE_MAX, { error: INVALID })
    .default(CONTACT_LIST_PAGE_SIZE_DEFAULT),
});
export type ListContactRequestsInput = z.input<typeof listContactRequestsSchema>;

/**
 * Açılan iletişim bilgisi: YALNIZ giden + `APPROVED` talepte dolu; istenen ve hedefin görünürlüğünün izin
 * verdiği alanlar. Geri alınınca (`REVOKED`) ya da başka her durumda `null`.
 */
export const revealedContactSchema = z
  .object({
    EMAIL: z.string().optional(),
    PHONE: z.string().optional(),
    SOCIAL_LINKS: z.record(z.string(), z.string()).optional(),
    LINKEDIN: z.string().optional(),
  })
  .strict();

export const contactRequestItemSchema = z.object({
  id: z.string(),
  /** Karşı taraf: gelen kutusunda talep eden, giden kutusunda hedef. Yalnız kimlik + ad. */
  counterpart: z.object({ userId: z.string(), name: z.string() }).strict(),
  fields: z.array(z.enum(CONTACT_FIELDS)),
  message: z.string().nullable(),
  status: z.enum(CONTACT_REQUEST_STATUSES),
  createdAt: z.date(),
  decidedAt: z.date().nullable(),
  closedAt: z.date().nullable(),
  revealed: revealedContactSchema.nullable(),
});
export type ContactRequestItem = z.infer<typeof contactRequestItemSchema>;

export const contactRequestPageSchema = z.object({
  items: z.array(contactRequestItemSchema),
  nextCursor: z.string().nullable(),
});
export type ContactRequestPage = z.infer<typeof contactRequestPageSchema>;

const AUTHED = ['AUTH_UNAUTHENTICATED', 'AUTH_ACCOUNT_SUSPENDED'] as const;

export const CONTACT_REQUEST_ACTION_ERRORS = {
  sendContactRequest: [
    'VALIDATION_INVALID',
    ...AUTHED,
    'AUTH_NOT_VERIFIED',
    'CONTACT_REQUEST_SELF',
    'CONTACT_REQUEST_ALREADY_OPEN',
    'CONTACT_FIELD_NOT_REQUESTABLE',
    'RESOURCE_NOT_FOUND',
    'RATE_LIMITED',
  ],
  respondToContactRequest: [
    'VALIDATION_INVALID',
    ...AUTHED,
    'CONTACT_REQUEST_NOT_PENDING',
    'RESOURCE_NOT_FOUND',
  ],
  withdrawContactRequest: [
    'VALIDATION_INVALID',
    ...AUTHED,
    'CONTACT_REQUEST_NOT_PENDING',
    'RESOURCE_NOT_FOUND',
  ],
  revokeContactRequest: [
    'VALIDATION_INVALID',
    ...AUTHED,
    'CONTACT_REQUEST_NOT_APPROVED',
    'RESOURCE_NOT_FOUND',
  ],
  listContactRequests: ['VALIDATION_INVALID', ...AUTHED],
} as const satisfies Record<string, readonly ErrorCode[]>;
