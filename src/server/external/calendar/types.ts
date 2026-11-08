/**
 * Takvim adaptör arayüzü (docs/architecture.md "Dış servisler" §3). Servis katmanı yalnız bunu bilir. Gerçek
 * (Google) adaptörü kullanıcı onayıyla ayrı kartla gelir; sahte adaptör başarı/zaman aşımı/hata senaryolarını üretir.
 * Sağlayıcının ham yanıtı hata mesajına/loga girmez.
 */
export type CalendarEventRequest = {
  appointmentId: string;
  summary: string;
  startsAt: Date;
  endsAt: Date;
  /** Davet edilen katılımcılar (e-posta paylaşımı onayda önceden söylenir). */
  attendeeEmails: readonly string[];
  /** Aynı anahtarla tekrar çağrı aynı etkinliği döner (iş yeniden denemesinde çift etkinlik olmaz). */
  idempotencyKey: string;
};
export type CalendarEvent = { eventId: string; meetUrl: string };

export interface CalendarPort {
  createEvent(
    request: CalendarEventRequest,
    options?: { signal?: AbortSignal },
  ): Promise<CalendarEvent>;
  /** Etkinlik yoksa da başarılıdır (iptal tekrarında hata vermez). */
  deleteEvent(eventId: string, options?: { signal?: AbortSignal }): Promise<void>;
}

export type CalendarErrorCode = 'CALENDAR_UNAVAILABLE' | 'CALENDAR_TIMEOUT' | 'CALENDAR_REJECTED';

export class CalendarError extends Error {
  constructor(
    readonly code: CalendarErrorCode,
    /** Yeniden denenebilir mi? (geçici kesinti/zaman aşımı) */
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'CalendarError';
  }
}
