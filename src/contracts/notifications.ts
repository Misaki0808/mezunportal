import { z } from 'zod';

/** P1-12: hesap/güvenlik bildirimleri kapatılamaz; geri kalan türler varsayılan açıktır. */
export const NOTIFICATION_TYPES = [
  'ACCOUNT_SECURITY',
  'GRADUATION_DECISION',
  'EXPERIENCE_MODERATION',
  'CONTACT_REQUEST',
  'CV_INVITATION',
  'CV_REVIEW',
  'PROFILE_FRESHNESS',
  'ALUMNI_STILL_THERE',
  'STUDENT_EMAIL_MIGRATION',
  'APPOINTMENT',
  'FAQ',
  'JOB_POSTING',
  'REFERRAL',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_CATALOG = {
  ACCOUNT_SECURITY: { mandatory: true },
  GRADUATION_DECISION: { mandatory: false },
  EXPERIENCE_MODERATION: { mandatory: false },
  CONTACT_REQUEST: { mandatory: false },
  CV_INVITATION: { mandatory: false },
  CV_REVIEW: { mandatory: false },
  PROFILE_FRESHNESS: { mandatory: false },
  ALUMNI_STILL_THERE: { mandatory: false },
  STUDENT_EMAIL_MIGRATION: { mandatory: false },
  APPOINTMENT: { mandatory: false },
  FAQ: { mandatory: false },
  JOB_POSTING: { mandatory: false },
  REFERRAL: { mandatory: false },
} as const satisfies Record<NotificationType, { mandatory: boolean }>;

export const notificationPreferenceSchema = z
  .object({
    type: z.enum(NOTIFICATION_TYPES),
    enabled: z.boolean(),
    mandatory: z.boolean(),
  })
  .strict();
export const notificationPreferencesSchema = z
  .object({ items: z.array(notificationPreferenceSchema) })
  .strict();
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export const setNotificationPreferencesSchema = z
  .object({
    items: z
      .array(z.object({ type: z.enum(NOTIFICATION_TYPES), enabled: z.boolean() }).strict())
      .min(1)
      .max(NOTIFICATION_TYPES.length),
  })
  .strict()
  .refine(({ items }) => new Set(items.map((item) => item.type)).size === items.length, {
    error: 'VALIDATION_INVALID',
  })
  .refine(
    ({ items }) =>
      items.every((item) => !NOTIFICATION_CATALOG[item.type].mandatory || item.enabled),
    { error: 'VALIDATION_INVALID' },
  );
export type SetNotificationPreferencesInput = z.input<typeof setNotificationPreferencesSchema>;

/** Aynı gönderinin iki bağlantısı tek kayıtla yarışır; birinci sonuçtan sonra ikisi de kullanılamaz. */
export const STILL_THERE_CHOICES = ['YES', 'NO'] as const;
export type StillThereChoice = (typeof STILL_THERE_CHOICES)[number];
export const stillThereInputSchema = z
  .object({ token: z.string().min(1).max(512), choice: z.enum(STILL_THERE_CHOICES) })
  .strict();
export type StillThereInput = z.input<typeof stillThereInputSchema>;
export const stillThereOutputSchema = z.object({ choice: z.enum(STILL_THERE_CHOICES) }).strict();
export type StillThereOutput = z.infer<typeof stillThereOutputSchema>;
