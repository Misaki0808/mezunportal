import 'server-only';

import { getCalendarEnv } from '@/lib/env';

import { createFakeCalendar } from './fake';
import type { CalendarPort } from './types';

export { CalendarError } from './types';
export type { CalendarEvent, CalendarEventRequest, CalendarPort } from './types';
export { createFakeCalendar } from './fake';

let cached: CalendarPort | null | undefined;

/**
 * Env'e göre adaptör (tembel). `CALENDAR_PROVIDER` boşsa `null`: takvim kapalıdır, mentor linki elle ekler.
 * Gerçek Google adaptörü E4 (kullanıcı onayı) sonrası buraya eklenir; arayüz değişmez.
 */
export function getCalendar(): CalendarPort | null {
  if (cached === undefined) {
    cached = getCalendarEnv().CALENDAR_PROVIDER === 'fake' ? createFakeCalendar() : null;
  }
  return cached;
}
