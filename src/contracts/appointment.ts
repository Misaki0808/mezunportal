import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

import { MEETING_MODES } from './mentor-directory';

/**
 * Randevu motoru sözleşmesi (P1-10; docs/architecture.md "Randevu ve Google Meet", D11). Servis (W1) ve ekran (W2)
 * paylaşır; DEĞİŞTİRMEZLER (değişiklik `ORTAK DOSYA İSTEĞİ`).
 *
 * Kurallar (sunucuda zorlanır, ekran ipucu olarak `actions` bayraklarını kullanır):
 *  - Saatler `Europe/Istanbul` (UTC+3, yaz saati yok); yayınlanan zamanlar UTC anıdır, haftalık müsaitlik yerel dakikadır.
 *  - Slot: önümüzdeki 21 gün, en az 24 saat sonrası, mentorun görüşme süresi adımıyla; dolu (REQUESTED/CONFIRMED),
 *    "müsait değilim" tarihine düşen ve kapasitesi dolu aya ait slotlar çıkarılır. Talep yalnız üretilen bir slota yapılır.
 *  - Durum makinesi: REQUESTED → CONFIRMED | DECLINED | CANCELLED (talep eden geri çeker) | EXPIRED (sistem);
 *    CONFIRMED → CANCELLED (iki taraf). COMPLETED/NO_SHOW görüşme sonrası formla gelir (P1-14).
 *  - D11: talep, talepten 72 saat sonra ya da başlangıçtan 12 saat önce, hangisi erkense EXPIRED olur.
 *  - Onayda kapasite: randevunun TAKVİM AYINDAKİ onaylı randevu sayısı < aylık kapasite (`APPOINTMENT_CAPACITY_FULL`);
 *    çakışmanın son sözü veritabanı exclusion constraint'idir (`APPOINTMENT_SLOT_TAKEN`).
 *  - Online onayda takvim etkinliği + Meet linki arka planda oluşturulur; hata/kapalı adaptör/rıza yoksa randevu YİNE
 *    onaylıdır ve `linkNeeded` doğru olur: mentor `setMeetLink` ile elle link ekler.
 *  - Randevu onayında iki tarafın e-posta adresi takvim davetinde paylaşılır; talep ekranı bunu önceden söyler
 *    (`SlotList.emailShared`).
 *  - Kimlik oturumdan gelir; istemci kimlikleri yalnız hedefi gösterir ve yetki vermez.
 */

const INVALID = 'VALIDATION_INVALID' satisfies ErrorCode;

export const APPOINTMENT_STATUSES = [
  'REQUESTED',
  'CONFIRMED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
  'NO_SHOW',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const SESSION_MINUTES = [15, 20, 30] as const;
export const APPOINTMENT_TIME_ZONE = 'Europe/Istanbul';
export const TIME_ZONE_OFFSET_MINUTES = 180;
export const SLOT_HORIZON_DAYS = 21;
export const SLOT_LEAD_HOURS = 24;
export const REQUEST_EXPIRY_HOURS = 72;
export const EXPIRY_BEFORE_START_HOURS = 12;
export const REMINDER_BEFORE_HOURS = 24;
export const MENTOR_MONTHLY_CAPACITY_MAX = 40;
export const APPOINTMENT_NOTE_MAX = 500;
export const AVAILABILITY_RULES_MAX = 28;
/** Kullanıcı başına talep hız sınırı (24 saatte). */
export const APPOINTMENT_REQUEST_RATE_LIMIT = { maxRequests: 10, windowSeconds: 86_400 } as const;

const text = (min: number, max: number) =>
  z.string({ error: INVALID }).trim().min(min, { error: INVALID }).max(max, { error: INVALID });
const id = text(1, 64);
const mode = z.enum(MEETING_MODES, { error: INVALID });

// ---------------------------------------------------------------------------------------------
// Mentor ayarları
// ---------------------------------------------------------------------------------------------

/** Haftalık müsaitlik: `weekday` 1 (pazartesi) – 7 (pazar), dakikalar o günün yerel saatindendir. `mode: null` = iki biçim. */
export const availabilityRuleSchema = z
  .object({
    weekday: z.number({ error: INVALID }).int({ error: INVALID }).min(1).max(7),
    startMinute: z.number({ error: INVALID }).int({ error: INVALID }).min(0).max(1435),
    endMinute: z.number({ error: INVALID }).int({ error: INVALID }).min(5).max(1440),
    mode: mode.nullable().default(null),
  })
  .strict()
  .refine((value) => value.startMinute % 5 === 0 && value.endMinute % 5 === 0, { error: INVALID })
  .refine((value) => value.endMinute > value.startMinute, { error: INVALID, path: ['endMinute'] });
export type AvailabilityRule = z.infer<typeof availabilityRuleSchema>;

/** Tüm haftalık müsaitlik tek seferde yazılır (yerine koyar); aynı günde çakışan aralık olamaz. */
export const saveAvailabilitySchema = z
  .object({
    rules: z
      .array(availabilityRuleSchema, { error: INVALID })
      .max(AVAILABILITY_RULES_MAX, { error: INVALID }),
  })
  .strict()
  .refine(
    (value) => {
      const byDay = new Map<number, AvailabilityRule[]>();
      for (const rule of value.rules)
        byDay.set(rule.weekday, [...(byDay.get(rule.weekday) ?? []), rule]);
      return [...byDay.values()].every((day) => {
        const sorted = [...day].sort((a, b) => a.startMinute - b.startMinute);
        return sorted.every(
          (rule, index) => index === 0 || rule.startMinute >= sorted[index - 1]!.endMinute,
        );
      });
    },
    { error: INVALID, path: ['rules'] },
  );
export type SaveAvailabilityInput = z.input<typeof saveAvailabilitySchema>;

export const saveMentorSettingsSchema = z
  .object({
    monthlyCapacity: z
      .number({ error: INVALID })
      .int({ error: INVALID })
      .min(1)
      .max(MENTOR_MONTHLY_CAPACITY_MAX),
    sessionMinutes: z.union(
      SESSION_MINUTES.map((value) => z.literal(value)) as [
        z.ZodLiteral<15>,
        z.ZodLiteral<20>,
        z.ZodLiteral<30>,
      ],
      { error: INVALID },
    ),
    meetingModes: z
      .array(mode, { error: INVALID })
      .min(1, { error: INVALID })
      .max(MEETING_MODES.length)
      .refine((list) => new Set(list).size === list.length, { error: INVALID }),
    /** Yüz yüze görüşme yeri notu; yüz yüze sunuluyorsa zorunlu. */
    inPersonNote: text(1, 300).nullable().default(null),
    /** Dizinde görünür ve talep alır. */
    isActive: z.boolean({ error: INVALID }),
  })
  .strict()
  .refine((value) => !value.meetingModes.includes('IN_PERSON') || value.inPersonNote !== null, {
    error: INVALID,
    path: ['inPersonNote'],
  });
export type SaveMentorSettingsInput = z.input<typeof saveMentorSettingsSchema>;

/** "Müsait değilim": verilen tarihe kadar yeni talep alınmaz; `null` modu kapatır. En çok 365 gün sonrası. */
export const setPauseSchema = z
  .object({ pausedUntil: z.coerce.date({ error: INVALID }).nullable() })
  .strict();
export type SetPauseInput = z.input<typeof setPauseSchema>;

export const mentorSettingsViewSchema = z
  .object({
    /** Bu kullanıcı mentor olabilir mi? (mezun/akademisyen ya da K-08'i geçmiş öğrenci). */
    eligible: z.boolean(),
    settings: z
      .object({
        monthlyCapacity: z.number().int(),
        sessionMinutes: z.number().int(),
        meetingModes: z.array(z.enum(MEETING_MODES)),
        inPersonNote: z.string().nullable(),
        isActive: z.boolean(),
        pausedUntil: z.date().nullable(),
      })
      .strict()
      .nullable(),
    rules: z.array(availabilityRuleSchema),
  })
  .strict();
export type MentorSettingsView = z.infer<typeof mentorSettingsViewSchema>;

// ---------------------------------------------------------------------------------------------
// Slotlar ve talep
// ---------------------------------------------------------------------------------------------

export const listSlotsSchema = z.object({ mentorId: id }).strict();
export type ListSlotsInput = z.input<typeof listSlotsSchema>;

export const slotSchema = z
  .object({
    startsAt: z.date(),
    endsAt: z.date(),
    /** Bu slotta sunulan biçimler. */
    modes: z.array(z.enum(MEETING_MODES)).min(1),
  })
  .strict();
export const slotListSchema = z
  .object({
    mentor: z
      .object({
        userId: z.string(),
        displayName: z.string(),
        sessionMinutes: z.number().int(),
        /** Yüz yüze sunuluyorsa yer notu (onaydan önce görünür). */
        inPersonNote: z.string().nullable(),
      })
      .strict(),
    slots: z.array(slotSchema),
    /** Mentor talep almıyorsa sebep (slot listesi boştur). */
    unavailableReason: z.enum(['PAUSED', 'CAPACITY_FULL', 'NO_AVAILABILITY']).nullable(),
    /** Onayda iki tarafın e-posta adresi takvim davetinde paylaşılır; ekran bunu talepten önce söyler. */
    emailShared: z.literal(true),
  })
  .strict();
export type SlotList = z.infer<typeof slotListSchema>;

export const requestAppointmentSchema = z
  .object({
    mentorId: id,
    startsAt: z.coerce.date({ error: INVALID }),
    mode,
    note: text(1, APPOINTMENT_NOTE_MAX).optional(),
  })
  .strict();
export type RequestAppointmentInput = z.input<typeof requestAppointmentSchema>;

export const appointmentIdSchema = z.object({ appointmentId: id }).strict();
export type AppointmentIdInput = z.input<typeof appointmentIdSchema>;

export const respondAppointmentSchema = z.discriminatedUnion(
  'decision',
  [
    z.object({ decision: z.literal('CONFIRM'), appointmentId: id }).strict(),
    z
      .object({
        decision: z.literal('DECLINE'),
        appointmentId: id,
        reason: text(3, 500).optional(),
      })
      .strict(),
  ],
  { error: INVALID },
);
export type RespondAppointmentInput = z.input<typeof respondAppointmentSchema>;

export const cancelAppointmentSchema = z
  .object({ appointmentId: id, reason: text(3, 500).optional() })
  .strict();
export type CancelAppointmentInput = z.input<typeof cancelAppointmentSchema>;

/** Mentorun elle eklediği görüşme bağlantısı: yalnız `https`, en çok 300 karakter. */
export const setMeetLinkSchema = z
  .object({
    appointmentId: id,
    url: z
      .string({ error: INVALID })
      .trim()
      .max(300, { error: INVALID })
      .refine(
        (value) => {
          try {
            const url = new URL(value);
            return (
              url.protocol === 'https:' &&
              url.username === '' &&
              url.password === '' &&
              url.hostname.includes('.')
            );
          } catch {
            return false;
          }
        },
        { error: 'APPOINTMENT_LINK_INVALID' satisfies ErrorCode },
      ),
  })
  .strict();
export type SetMeetLinkInput = z.input<typeof setMeetLinkSchema>;

// ---------------------------------------------------------------------------------------------
// Randevu görünümü
// ---------------------------------------------------------------------------------------------

export const listMyAppointmentsSchema = z
  .object({
    /** `MENTOR`: bana gelen talepler; `MENTEE`: benim istediklerim. */
    role: z.enum(['MENTOR', 'MENTEE'], { error: INVALID }),
    statuses: z
      .array(z.enum(APPOINTMENT_STATUSES, { error: INVALID }), { error: INVALID })
      .min(1)
      .max(APPOINTMENT_STATUSES.length)
      .optional(),
    cursor: id.optional(),
    limit: z.number({ error: INVALID }).int({ error: INVALID }).min(1).max(50).default(20),
  })
  .strict();
export type ListMyAppointmentsInput = z.input<typeof listMyAppointmentsSchema>;

export const appointmentViewSchema = z
  .object({
    id: z.string(),
    status: z.enum(APPOINTMENT_STATUSES),
    /** Bu randevuda kullanıcının rolü. */
    role: z.enum(['MENTOR', 'MENTEE']),
    counterpart: z.object({ userId: z.string(), displayName: z.string() }).strict(),
    startsAt: z.date(),
    endsAt: z.date(),
    mode: z.enum(MEETING_MODES),
    note: z.string().nullable(),
    /** Yüz yüze: onayda kaydedilen yer notu. */
    location: z.string().nullable(),
    meetUrl: z.string().nullable(),
    /** Online onaylı randevuda link henüz yok: mentor elle ekler (takvim hatası/kapalı adaptör/rıza yok). */
    linkNeeded: z.boolean(),
    /** REQUESTED için yanıt son tarihi (D11). */
    expiresAt: z.date().nullable(),
    decidedAt: z.date().nullable(),
    cancelledBy: z.enum(['MENTOR', 'MENTEE', 'SYSTEM']).nullable(),
    cancelReason: z.string().nullable(),
    createdAt: z.date(),
    /** Ekranın düğmeleri; sunucu her eylemde yine denetler. */
    actions: z
      .object({
        canConfirm: z.boolean(),
        /** Onay engelliyse sebep (düğmenin yanında yazılır). */
        confirmBlockedReason: z.enum(['CAPACITY_FULL', 'EXPIRED']).nullable(),
        canDecline: z.boolean(),
        canCancel: z.boolean(),
        canSetLink: z.boolean(),
        canDownloadIcs: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type AppointmentView = z.infer<typeof appointmentViewSchema>;

export const appointmentPageSchema = z
  .object({ items: z.array(appointmentViewSchema), nextCursor: z.string().nullable() })
  .strict();
export type AppointmentPage = z.infer<typeof appointmentPageSchema>;

/** `.ics` yalnız onaylı randevuda ve yalnız iki katılımcıya; sunucu rotası. */
export const appointmentIcsHref = (appointmentId: string) =>
  `/api/randevu/${encodeURIComponent(appointmentId)}/ics`;
export const APPOINTMENT_ICS_CONTENT_TYPE = 'text/calendar; charset=utf-8';

// ---------------------------------------------------------------------------------------------
// Eylem → olası hata kodları
// ---------------------------------------------------------------------------------------------

const authErrors = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
] as const;

export const APPOINTMENT_ACTION_ERRORS = {
  getMyMentorSettings: [...authErrors],
  saveMentorSettings: [
    ...authErrors,
    'VALIDATION_INVALID',
    'MENTOR_NOT_ELIGIBLE',
    'MENTOR_SETTINGS_INVALID',
  ],
  saveAvailability: [
    ...authErrors,
    'VALIDATION_INVALID',
    'MENTOR_NOT_ELIGIBLE',
    'MENTOR_SETTINGS_INVALID',
  ],
  setPause: [...authErrors, 'VALIDATION_INVALID', 'MENTOR_NOT_ELIGIBLE'],
  listSlots: [...authErrors, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
  requestAppointment: [
    ...authErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'RATE_LIMITED',
    'APPOINTMENT_SLOT_INVALID',
    'APPOINTMENT_SLOT_TAKEN',
    'APPOINTMENT_MENTOR_UNAVAILABLE',
    'APPOINTMENT_OPEN_REQUEST_EXISTS',
    'APPOINTMENT_CAPACITY_FULL',
  ],
  respondAppointment: [
    ...authErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'APPOINTMENT_NOT_REQUESTED',
    'APPOINTMENT_EXPIRED',
    'APPOINTMENT_CAPACITY_FULL',
    'APPOINTMENT_SLOT_TAKEN',
  ],
  cancelAppointment: [
    ...authErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'APPOINTMENT_NOT_CANCELLABLE',
  ],
  setMeetLink: [
    ...authErrors,
    'VALIDATION_INVALID',
    'RESOURCE_NOT_FOUND',
    'APPOINTMENT_LINK_NOT_NEEDED',
    'APPOINTMENT_LINK_INVALID',
  ],
  listMyAppointments: [...authErrors, 'VALIDATION_INVALID'],
  getAppointment: [...authErrors, 'VALIDATION_INVALID', 'RESOURCE_NOT_FOUND'],
} as const satisfies Record<string, readonly ErrorCode[]>;
