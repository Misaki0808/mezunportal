import {
  CalendarError,
  type CalendarEvent,
  type CalendarEventRequest,
  type CalendarPort,
} from './types';

/**
 * Sahte takvim: bellekte etkinlik tutar, deterministik Meet adresi üretir. `fail` ile hata senaryoları:
 * `once` ilk oluşturma çağrısı geçici hata verir (yeniden deneme başarır), `always` hep geçici hata, `timeout`
 * zaman aşımı, `rejected` kalıcı red. `deleteFail` silmede hata taklidi. Yalnız local/test.
 */
export type FakeCalendarOptions = {
  fail?: 'never' | 'once' | 'always' | 'timeout' | 'rejected';
  deleteFail?: 'never' | 'always';
};

export type FakeCalendar = CalendarPort & {
  readonly events: ReadonlyMap<string, CalendarEventRequest & CalendarEvent>;
  readonly createCalls: number;
  readonly deleteCalls: number;
  configure(options: FakeCalendarOptions): void;
};

export function createFakeCalendar(initial: FakeCalendarOptions = {}): FakeCalendar {
  let options: FakeCalendarOptions = initial;
  const events = new Map<string, CalendarEventRequest & CalendarEvent>();
  const byKey = new Map<string, string>();
  let createCalls = 0;
  let deleteCalls = 0;
  let failedOnce = false;
  return {
    get events() {
      return events;
    },
    get createCalls() {
      return createCalls;
    },
    get deleteCalls() {
      return deleteCalls;
    },
    configure(next) {
      options = next;
      failedOnce = false;
    },
    async createEvent(request): Promise<CalendarEvent> {
      createCalls += 1;
      const mode = options.fail ?? 'never';
      if (mode === 'always') throw new CalendarError('CALENDAR_UNAVAILABLE', true);
      if (mode === 'timeout') throw new CalendarError('CALENDAR_TIMEOUT', true);
      if (mode === 'rejected') throw new CalendarError('CALENDAR_REJECTED', false);
      if (mode === 'once' && !failedOnce) {
        failedOnce = true;
        throw new CalendarError('CALENDAR_UNAVAILABLE', true);
      }
      const existing = byKey.get(request.idempotencyKey);
      if (existing) {
        const event = events.get(existing)!;
        return { eventId: event.eventId, meetUrl: event.meetUrl };
      }
      const eventId = `fake-event-${events.size + 1}-${request.appointmentId.slice(0, 8)}`;
      const meetUrl = `https://meet.fake.mezunportal.test/${eventId}`;
      events.set(eventId, { ...request, eventId, meetUrl });
      byKey.set(request.idempotencyKey, eventId);
      return { eventId, meetUrl };
    },
    async deleteEvent(eventId): Promise<void> {
      deleteCalls += 1;
      if (options.deleteFail === 'always') throw new CalendarError('CALENDAR_UNAVAILABLE', true);
      events.delete(eventId);
    },
  };
}
