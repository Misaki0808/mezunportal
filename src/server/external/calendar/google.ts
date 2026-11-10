import { createHash } from 'node:crypto';

import {
  CalendarError,
  type CalendarEvent,
  type CalendarEventRequest,
  type CalendarPort,
} from './types';

/**
 * Google Takvim / Meet adaptörü (kart 174; docs/architecture.md "Dış servisler"). YENİ BAĞIMLILIK YOK: Google REST'i `fetch` ile
 * çağrılır. Güvenlik ve dayanıklılık ilkeleri:
 *  - Erişim jetonu yalnız bellektedir (süresi dolmadan 60 sn önce yenilenir, yenileme tek uçuşludur); yenileme jetonu bu dosyaya
 *    yalnız `loadRefreshToken` ile gelir ve hiçbir yere yazılmaz. Bu dosya hiçbir şey LOGLAMAZ; hata mesajları yalnız kararlı
 *    koddur (sağlayıcının ham yanıtı, jeton, e-posta hata nesnesine/loga girmez).
 *  - Çift etkinlik olmaz: etkinlik kimliği `idempotencyKey`'den türetilir (Google istemci kimliğini kabul eder); aynı anahtarla
 *    tekrar çağrı 409 alır ve mevcut etkinlik okunur. Meet isteği de aynı anahtardan türeyen `requestId` taşır.
 *  - Davetliler öğrenci + mentordur; `sendUpdates=all` ile Google davet/güncelleme/iptal e-postası gönderir. Saat dilimi
 *    `Europe/Istanbul`.
 *  - Hata sınıfları: ağ/zaman aşımı/429/5xx = yeniden denenebilir; 400/403/404 = kalıcı red; bağlantı yok ya da yetki geri
 *    alınmış (`invalid_grant`) = `CALENDAR_NOT_CONNECTED` (yeniden denemek boşuna; yönetici yeniden bağlar).
 */

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const TIME_ZONE = 'Europe/Istanbul';
const TOKEN_SKEW_MS = 60_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const CONFERENCE_POLLS = 3;
const CONFERENCE_POLL_DELAY_MS = 1_000;

export type GoogleCalendarDeps = {
  clientId: string;
  clientSecret: string;
  /** Yenileme jetonu (düz metin, bellekte kısa ömürlü). Bağlı değilse `null`; çözülemiyorsa fırlatabilir (bağlı değil sayılır). */
  loadRefreshToken: () => Promise<string | null>;
  /** Yenileme jetonu Google tarafından reddedildi (`invalid_grant`): bağlantı "yeniden bağla" durumuna alınır. */
  onTokenRejected: () => Promise<void>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

type GoogleEvent = {
  id?: string;
  status?: string;
  hangoutLink?: string;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
    createRequest?: { status?: { statusCode?: string } };
  };
};

/** `idempotencyKey` → Google etkinlik kimliği (base32hex alfabesi: 0-9a-v; hex bunun alt kümesidir; 5–1024 karakter). */
export function googleEventId(idempotencyKey: string): string {
  return `mp${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 48)}`;
}

function meetUrlOf(event: GoogleEvent): string | null {
  const video = event.conferenceData?.entryPoints?.find(
    (entry) => entry.entryPointType === 'video',
  );
  const url = video?.uri ?? event.hangoutLink ?? null;
  return url && /^https:\/\/meet\.google\.com\//.test(url) ? url : null;
}

const when = (date: Date) => ({ dateTime: date.toISOString(), timeZone: TIME_ZONE });

export function createGoogleCalendar(deps: GoogleCalendarDeps): CalendarPort {
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let cached: { token: string; expiresAt: number } | null = null;
  let inflight: Promise<string> | null = null;

  /** Ağ hatasını kararlı koda çevirir; hata nesnesi (URL, başlık, jeton) taşınmaz. */
  async function send(
    url: string,
    init: RequestInit,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const timeout = AbortSignal.timeout(timeoutMs);
    try {
      return await doFetch(url, {
        ...init,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      if (name === 'TimeoutError' || name === 'AbortError')
        throw new CalendarError('CALENDAR_TIMEOUT', true);
      throw new CalendarError('CALENDAR_UNAVAILABLE', true);
    }
  }

  async function refresh(signal: AbortSignal | undefined): Promise<string> {
    let refreshToken: string | null;
    try {
      refreshToken = await deps.loadRefreshToken();
    } catch {
      refreshToken = null;
    }
    if (!refreshToken) throw new CalendarError('CALENDAR_NOT_CONNECTED', false);
    const response = await send(
      TOKEN_URL,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: deps.clientId,
          client_secret: deps.clientSecret,
        }),
      },
      signal,
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (response.status === 400 && body?.error === 'invalid_grant') {
        cached = null;
        await deps.onTokenRejected().catch(() => undefined);
        throw new CalendarError('CALENDAR_NOT_CONNECTED', false);
      }
      // Yanlış istemci kimliği/sırrı gibi kalıcı yapılandırma hataları yeniden denemekle düzelmez.
      const retryable = response.status === 429 || response.status >= 500;
      throw new CalendarError(retryable ? 'CALENDAR_UNAVAILABLE' : 'CALENDAR_REJECTED', retryable);
    }
    const data = (await response.json().catch(() => null)) as {
      access_token?: unknown;
      expires_in?: unknown;
    } | null;
    if (typeof data?.access_token !== 'string' || data.access_token === '')
      throw new CalendarError('CALENDAR_UNAVAILABLE', true);
    const seconds =
      typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 3600;
    cached = { token: data.access_token, expiresAt: now() + seconds * 1000 };
    return cached.token;
  }

  async function accessToken(signal: AbortSignal | undefined, force = false): Promise<string> {
    if (!force && cached && cached.expiresAt - TOKEN_SKEW_MS > now()) return cached.token;
    // Tek uçuş: eşzamanlı çağrılar aynı yenilemeyi bekler (Google'a gereksiz istek ve yarış yok).
    inflight ??= refresh(signal).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  /** Yetkili istek; 401'de bir kez jeton yenileyip tekrar dener. Dönüş: `Response` (durum çağırana bırakılır). */
  async function call(
    method: string,
    path: string,
    query: Record<string, string>,
    body: unknown,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const url = `${CALENDAR_API}${path}?${new URLSearchParams(query).toString()}`;
    const attempt = async (token: string) =>
      send(
        url,
        {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        signal,
      );
    let response = await attempt(await accessToken(signal));
    if (response.status === 401) {
      cached = null;
      response = await attempt(await accessToken(signal, true));
    }
    return response;
  }

  /** Başarısız yanıtı kararlı hataya çevirir; gövde okunmaz/aktarılmaz. */
  function failure(response: Response): CalendarError {
    if (response.status === 401) return new CalendarError('CALENDAR_NOT_CONNECTED', false);
    const retryable = response.status === 429 || response.status >= 500 || response.status === 408;
    return new CalendarError(retryable ? 'CALENDAR_UNAVAILABLE' : 'CALENDAR_REJECTED', retryable);
  }

  async function readEvent(id: string, signal: AbortSignal | undefined): Promise<GoogleEvent> {
    const response = await call('GET', `/${id}`, { conferenceDataVersion: '1' }, undefined, signal);
    if (!response.ok) throw failure(response);
    return (await response.json().catch(() => ({}))) as GoogleEvent;
  }

  async function withMeet(
    id: string,
    first: GoogleEvent,
    signal: AbortSignal | undefined,
  ): Promise<CalendarEvent> {
    let event = first;
    for (let poll = 0; ; poll += 1) {
      const meetUrl = meetUrlOf(event);
      if (meetUrl) return { eventId: id, meetUrl };
      // Meet bağlantısı bazen birkaç saniye "pending" kalır; aynı kimlikle kısa süre yoklanır.
      if (poll >= CONFERENCE_POLLS) throw new CalendarError('CALENDAR_UNAVAILABLE', true);
      await sleep(CONFERENCE_POLL_DELAY_MS);
      event = await readEvent(id, signal);
    }
  }

  return {
    async createEvent(request: CalendarEventRequest, options): Promise<CalendarEvent> {
      const id = googleEventId(request.idempotencyKey);
      const response = await call(
        'POST',
        '',
        { conferenceDataVersion: '1', sendUpdates: 'all' },
        {
          id,
          summary: request.summary,
          start: when(request.startsAt),
          end: when(request.endsAt),
          attendees: request.attendeeEmails.map((email) => ({ email })),
          conferenceData: {
            createRequest: { requestId: id, conferenceSolutionKey: { type: 'hangoutsMeet' } },
          },
          guestsCanModify: false,
          guestsCanInviteOthers: false,
          // D7: mentor ve öğrenci davette birbirinin e-postasını görmez (iletişim bilgisi yalnız onaylı talepte açılır).
          guestsCanSeeOtherGuests: false,
          extendedProperties: { private: { mezunportalAppointment: request.appointmentId } },
        },
        options?.signal,
      );
      if (response.status === 409) {
        // Aynı anahtarla önceki deneme etkinliği oluşturmuş: mevcut olanı oku (çift etkinlik yok).
        const existing = await readEvent(id, options?.signal);
        if (existing.status === 'cancelled') throw new CalendarError('CALENDAR_REJECTED', false);
        return withMeet(id, existing, options?.signal);
      }
      if (!response.ok) throw failure(response);
      return withMeet(
        id,
        (await response.json().catch(() => ({}))) as GoogleEvent,
        options?.signal,
      );
    },

    async updateEvent(eventId, patch, options): Promise<void> {
      const response = await call(
        'PATCH',
        `/${encodeURIComponent(eventId)}`,
        { sendUpdates: 'all' },
        {
          start: when(patch.startsAt),
          end: when(patch.endsAt),
          ...(patch.summary === undefined ? {} : { summary: patch.summary }),
        },
        options?.signal,
      );
      if (!response.ok) throw failure(response);
    },

    async deleteEvent(eventId, options): Promise<void> {
      const response = await call(
        'DELETE',
        `/${encodeURIComponent(eventId)}`,
        { sendUpdates: 'all' },
        undefined,
        options?.signal,
      );
      // Etkinlik zaten yok/silinmiş: iptal tekrarı başarılıdır.
      if (response.status === 404 || response.status === 410) return;
      if (!response.ok) throw failure(response);
    },
  };
}
