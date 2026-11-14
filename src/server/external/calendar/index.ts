import 'server-only';

import { getAuthEnv, getCalendarEnv } from '@/lib/env';

import { getDb } from '../../db';
import { createGoogleTokenStore } from '../../services/google-calendar-connection';
import { createFakeCalendar } from './fake';
import { createGoogleCalendar } from './google';
import type { CalendarPort } from './types';

export { CalendarError } from './types';
export type { CalendarEvent, CalendarEventRequest, CalendarPort } from './types';
export { createFakeCalendar } from './fake';
export { createGoogleCalendar } from './google';

let cached: CalendarPort | null | undefined;

/**
 * Env'e göre adaptör (tembel). `CALENDAR_PROVIDER` boşsa `null`: takvim kapalıdır, mentor linki elle ekler. `google`: gerçek
 * Google Takvim/Meet adaptörü; yenileme jetonu veritabanından (şifreli) okunur, bağlantı kurulmamışsa etkinlik açılmaz
 * (`CALENDAR_NOT_CONNECTED`) ve randevu elle linke düşer. Arayüz (`CalendarPort`) değişmez.
 */
export function getCalendar(): CalendarPort | null {
  if (cached === undefined) {
    const env = getCalendarEnv();
    if (env.CALENDAR_PROVIDER === 'fake') cached = createFakeCalendar();
    else if (env.CALENDAR_PROVIDER === 'google') {
      const store = createGoogleTokenStore(getDb(), getAuthEnv().BETTER_AUTH_SECRET);
      cached = createGoogleCalendar({
        clientId: env.GOOGLE_CLIENT_ID!,
        clientSecret: env.GOOGLE_CLIENT_SECRET!,
        loadRefreshToken: store.loadRefreshToken,
        isConnected: store.isConnected,
        onTokenRejected: store.markRejected,
      });
    } else cached = null;
  }
  return cached;
}

/** Bağlantı kurulunca/kesilince çağrılır: bellekteki erişim jetonu atılsın diye adaptör yeniden kurulur. */
export function resetCalendar(): void {
  cached = undefined;
}
