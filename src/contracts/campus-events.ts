import { z } from 'zod';
import { adminId, adminPageInput, adminReason } from './admin';

const INVALID = 'VALIDATION_INVALID';
export const CAMPUS_EVENT_STATUSES = ['PENDING', 'PUBLISHED', 'REJECTED', 'CANCELLED'] as const;
export const EVENT_ATTENDANCE_POINTS = 5;
export const EVENT_ATTENDANCE_DELAY_DAYS = 3;
export const EVENT_ATTENDANCE_MONTHLY_LIMIT = 4;
export const EVENT_CODE_PERIOD_SECONDS = 120;
export const EVENT_CODE_ATTEMPTS_PER_MINUTE = 5;

/** Bölüm ve yönetici yetkisi istemciden değil, her eylemde sunucudan doğrulanır. */
export const campusEventIdSchema = z.object({ eventId: adminId }).strict();
export const createCampusEventSchema = z
  .object({
    title: z
      .string({ error: INVALID })
      .trim()
      .min(3, { error: INVALID })
      .max(120, { error: INVALID }),
    description: z
      .string({ error: INVALID })
      .trim()
      .min(10, { error: INVALID })
      .max(3000, { error: INVALID }),
    location: z
      .string({ error: INVALID })
      .trim()
      .min(2, { error: INVALID })
      .max(200, { error: INVALID }),
    startsAt: z.iso.datetime({ offset: true, error: INVALID }),
    endsAt: z.iso.datetime({ offset: true, error: INVALID }),
    capacity: z
      .number({ error: INVALID })
      .int()
      .min(1, { error: INVALID })
      .max(10000, { error: INVALID }),
    departmentIds: z.array(adminId).min(1, { error: INVALID }).max(10, { error: INVALID }),
  })
  .strict()
  .refine(({ startsAt, endsAt }) => Date.parse(startsAt) < Date.parse(endsAt), {
    error: INVALID,
    path: ['endsAt'],
  })
  .refine(({ departmentIds }) => new Set(departmentIds).size === departmentIds.length, {
    error: INVALID,
    path: ['departmentIds'],
  });
export const listCampusEventsSchema = z.object({ cursor: adminPageInput.cursor }).strict();
export const reviewCampusEventSchema = campusEventIdSchema
  .extend({
    decision: z.enum(['PUBLISH', 'REJECT'], { error: INVALID }),
    reason: adminReason,
  })
  .strict();
export const cancelCampusEventSchema = campusEventIdSchema.extend({ reason: adminReason }).strict();
export const checkInCampusEventSchema = campusEventIdSchema
  .extend({ code: z.string({ error: INVALID }).regex(/^\d{6}$/, { error: INVALID }) })
  .strict();

/** Hatalı, süresi dolmuş, pencere dışı ve sınır aşımı denemeleri aynı olumsuz yanıtı verir. */
export const checkInCampusEventResultSchema = z.object({ accepted: z.boolean() }).strict();
export const campusEventViewSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    location: z.string(),
    startsAt: z.date(),
    endsAt: z.date(),
    capacity: z.number().int().positive(),
    registeredCount: z.number().int().nonnegative(),
    registered: z.boolean(),
    attended: z.boolean(),
  })
  .strict();
/** Kod sadece kapsamlı yöneticiye ve etkinlik penceresinde sunulur. */
export const campusEventCodeSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
    qrSvg: z.string().min(1),
    expiresAt: z.date(),
    attendanceCount: z.number().int().nonnegative(),
  })
  .strict();
export type CreateCampusEventInput = z.input<typeof createCampusEventSchema>;
export type CampusEventIdInput = z.input<typeof campusEventIdSchema>;
export type ListCampusEventsInput = z.input<typeof listCampusEventsSchema>;
export type ReviewCampusEventInput = z.input<typeof reviewCampusEventSchema>;
export type CancelCampusEventInput = z.input<typeof cancelCampusEventSchema>;
export type CheckInCampusEventInput = z.input<typeof checkInCampusEventSchema>;
export type CampusEventView = z.infer<typeof campusEventViewSchema>;
export type CampusEventCode = z.infer<typeof campusEventCodeSchema>;

export const CAMPUS_EVENT_ACTION_ACCESS = {
  createCampusEvent: 'ANY_ADMIN',
  listCampusEventModeration: 'ANY_ADMIN',
  reviewCampusEvent: 'ANY_ADMIN',
  cancelCampusEvent: 'ANY_ADMIN',
  getCampusEventCode: 'ANY_ADMIN',
  listCampusEvents: 'MEMBER',
  getCampusEvent: 'MEMBER',
  registerCampusEvent: 'MEMBER',
  checkInCampusEvent: 'MEMBER',
} as const;
