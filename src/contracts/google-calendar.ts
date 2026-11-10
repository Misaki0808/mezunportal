import { z } from 'zod';

import type { ErrorCode } from '@/lib/errors';

/**
 * Google Takvim/Meet bağlantısı sözleşmesi (kart 174). Yalnız sistem yöneticisi: tek seferlik OAuth yetkilendirmesi `/api/google/connect`
 * → Google → `/api/google/callback` rotalarında (sunucu eylemi değil, tarayıcı yönlendirmesi) yapılır; bu dosyadaki eylemler durumu
 * okur ve bağlantıyı keser. Yenileme jetonu hiçbir yanıtta yoktur (veritabanında şifreli kalır).
 */
export const GOOGLE_CONNECT_HREF = '/api/google/connect';
export const GOOGLE_CALLBACK_PATH = '/api/google/callback';
export const GOOGLE_ADMIN_HREF = '/yonetim/google';

/** `/yonetim/google?durum=…` sonuç anahtarları (mesaj kataloğunda karşılığı var). */
export const GOOGLE_CONNECT_OUTCOMES = [
  'connected',
  'denied',
  'failed',
  'invalid',
  'not-configured',
] as const;
export type GoogleConnectOutcome = (typeof GOOGLE_CONNECT_OUTCOMES)[number];

export const getGoogleCalendarStatusSchema = z.object({}).strict();
export type GetGoogleCalendarStatusInput = z.input<typeof getGoogleCalendarStatusSchema>;

/**
 * `mode`: `CALENDAR_PROVIDER` (OFF = kapalı: mentor linki elle ekler; FAKE = yerel sahte; GOOGLE = gerçek). `configured`: Google
 * istemci kimliği/sırrı tanımlı mı. `connection`: yönetici bağlamış mı (`NEEDS_RECONNECT` = yetki geri alındı ya da jeton çözülemedi).
 * `redirectUri`: Cloud Console'a yazılacak yönlendirme adresi (kurulum rehberi için).
 */
export const googleCalendarStatusSchema = z
  .object({
    mode: z.enum(['OFF', 'FAKE', 'GOOGLE']),
    configured: z.boolean(),
    connection: z.enum(['NONE', 'ACTIVE', 'NEEDS_RECONNECT']),
    accountLabel: z.string().nullable(),
    connectedAt: z.date().nullable(),
    redirectUri: z.string().nullable(),
  })
  .strict();
export type GoogleCalendarStatus = z.infer<typeof googleCalendarStatusSchema>;

export const disconnectGoogleCalendarSchema = z.object({}).strict();
export type DisconnectGoogleCalendarInput = z.input<typeof disconnectGoogleCalendarSchema>;
/** `revoked`: Google'da jeton da iptal edildi mi (en iyi çaba; başarısız olsa da bağlantı yerelde kesilir). */
export const disconnectGoogleCalendarOutputSchema = z
  .object({ disconnected: z.literal(true), revoked: z.boolean() })
  .strict();
export type DisconnectGoogleCalendarOutput = z.infer<typeof disconnectGoogleCalendarOutputSchema>;

export const GOOGLE_CALENDAR_ACTION_ACCESS = {
  getGoogleCalendarStatus: 'SYSTEM_ONLY',
  disconnectGoogleCalendar: 'SYSTEM_ONLY',
} as const satisfies Record<string, 'SYSTEM_ONLY'>;
export type GoogleCalendarActionName = keyof typeof GOOGLE_CALENDAR_ACTION_ACCESS;

const AUTH_ERRORS = [
  'AUTH_UNAUTHENTICATED',
  'AUTH_ACCOUNT_SUSPENDED',
  'AUTH_NOT_VERIFIED',
  'AUTH_FORBIDDEN',
  'CONSENT_REQUIRED',
] as const satisfies readonly ErrorCode[];

export const GOOGLE_CALENDAR_ACTION_ERRORS = {
  getGoogleCalendarStatus: [...AUTH_ERRORS],
  disconnectGoogleCalendar: [...AUTH_ERRORS, 'VALIDATION_INVALID'],
} as const satisfies Record<GoogleCalendarActionName, readonly ErrorCode[]>;
