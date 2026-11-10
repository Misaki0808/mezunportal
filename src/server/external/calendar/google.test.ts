import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGoogleCalendar, googleEventId, type GoogleCalendarDeps } from './google';
import { CalendarError, type CalendarEventRequest } from './types';

const REFRESH = '1//0gSECRET-yenileme-jetonu-XYZ';
const ACCESS = 'ya29.SECRET-erisim-jetonu-ABC';
const MEET = 'https://meet.google.com/abc-defg-hij';
const request: CalendarEventRequest = {
  appointmentId: 'rnd-1',
  summary: 'MezunPortal görüşmesi: Ayşe – Can',
  startsAt: new Date('2030-03-04T10:00:00.000Z'),
  endsAt: new Date('2030-03-04T10:30:00.000Z'),
  attendeeEmails: ['mentor@test.mezunportal.local', 'ogrenci@test.mezunportal.local'],
  idempotencyKey: 'appointment:rnd-1',
};

type Call = { url: string; method: string; headers: Record<string, string>; body: string | null };
type Reply = Response | Error | ((call: Call) => Response | Error);
const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const meetEvent = {
  id: 'x',
  conferenceData: { entryPoints: [{ entryPointType: 'video', uri: MEET }] },
};

function harness(overrides: Partial<GoogleCalendarDeps> = {}) {
  const calls: Call[] = [];
  const queue: Reply[] = [];
  let clock = 1_000_000;
  const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
    const call: Call = {
      url: String(url),
      method: String(init.method ?? 'GET'),
      headers: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)),
      body: init.body === undefined || init.body === null ? null : String(init.body),
    };
    calls.push(call);
    const next = queue.shift();
    if (!next) throw new Error('beklenmeyen istek: ' + call.method + ' ' + call.url);
    const reply = typeof next === 'function' ? next(call) : next;
    if (reply instanceof Error) throw reply;
    return reply;
  }) as typeof fetch;
  const rejected = vi.fn(async () => undefined);
  const sleep = vi.fn(async () => undefined);
  const calendar = createGoogleCalendar({
    clientId: 'istemci-kimligi',
    clientSecret: 'istemci-sirri',
    loadRefreshToken: async () => REFRESH,
    onTokenRejected: rejected,
    fetchImpl,
    now: () => clock,
    sleep,
    ...overrides,
  });
  const token = () => json(200, { access_token: ACCESS, expires_in: 3600 });
  return {
    calendar,
    calls,
    rejected,
    sleep,
    queue,
    token,
    advance: (ms: number) => void (clock += ms),
  };
}
const code = async (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) =>
      error instanceof CalendarError ? { code: error.code, retryable: error.retryable } : error,
  );

afterEach(() => vi.restoreAllMocks());

describe('Google Takvim adaptörü: etkinlik oluşturma', () => {
  it('Meet isteğiyle oluşturur: conferenceDataVersion=1, sendUpdates=all, İstanbul saat dilimi, davetliler, deterministik kimlik', async () => {
    const h = harness();
    h.queue.push(h.token(), json(200, meetEvent));
    const event = await h.calendar.createEvent(request);
    const id = googleEventId('appointment:rnd-1');
    expect(event).toEqual({ eventId: id, meetUrl: MEET });
    const [tokenCall, create] = h.calls;
    expect(tokenCall!.url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(tokenCall!.body ?? '');
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe(REFRESH);
    expect(form.get('client_id')).toBe('istemci-kimligi');
    expect(create!.method).toBe('POST');
    const url = new URL(create!.url);
    expect(url.origin + url.pathname).toBe(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    );
    expect(url.searchParams.get('conferenceDataVersion')).toBe('1');
    expect(url.searchParams.get('sendUpdates')).toBe('all');
    expect(create!.headers.authorization).toBe(`Bearer ${ACCESS}`);
    const body = JSON.parse(create!.body!);
    expect(body).toMatchObject({
      id,
      summary: request.summary,
      start: { dateTime: '2030-03-04T10:00:00.000Z', timeZone: 'Europe/Istanbul' },
      end: { dateTime: '2030-03-04T10:30:00.000Z', timeZone: 'Europe/Istanbul' },
      attendees: [
        { email: 'mentor@test.mezunportal.local' },
        { email: 'ogrenci@test.mezunportal.local' },
      ],
      conferenceData: {
        createRequest: { requestId: id, conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
      guestsCanModify: false,
      guestsCanInviteOthers: false,
    });
  });

  it('kimlik anahtardan türer: aynı anahtar aynı kimlik, farklı anahtar farklı kimlik; Google alfabesine uyar', () => {
    expect(googleEventId('a')).toBe(googleEventId('a'));
    expect(googleEventId('a')).not.toBe(googleEventId('b'));
    expect(googleEventId('appointment:rnd-1')).toMatch(/^mp[0-9a-v]{48}$/);
  });

  it('hangoutLink yedeği: giriş noktası yoksa yalnız meet.google.com bağlantısı kabul edilir', async () => {
    const h = harness();
    h.queue.push(h.token(), json(200, { hangoutLink: MEET }));
    expect((await h.calendar.createEvent(request)).meetUrl).toBe(MEET);
    const h2 = harness();
    h2.queue.push(h2.token(), json(200, { hangoutLink: 'https://kotu.example/abc' }));
    h2.queue.push(
      ...Array(3)
        .fill(null)
        .map(() => json(200, {})),
    );
    expect(await code(h2.calendar.createEvent(request))).toEqual({
      code: 'CALENDAR_UNAVAILABLE',
      retryable: true,
    });
  });

  it('aynı anahtarla tekrar (409): mevcut etkinlik okunur, çift etkinlik açılmaz; iptal edilmiş etkinlik reddedilir', async () => {
    const h = harness();
    h.queue.push(h.token(), json(409), json(200, meetEvent));
    const event = await h.calendar.createEvent(request);
    expect(event.meetUrl).toBe(MEET);
    expect(h.calls.map((c) => c.method)).toEqual(['POST', 'POST', 'GET']);
    const h2 = harness();
    h2.queue.push(h2.token(), json(409), json(200, { ...meetEvent, status: 'cancelled' }));
    expect(await code(h2.calendar.createEvent(request))).toEqual({
      code: 'CALENDAR_REJECTED',
      retryable: false,
    });
  });

  it('Meet bağlantısı "pending" ise aynı kimlikle kısa süre yoklanır; hiç gelmezse yeniden denenebilir hata', async () => {
    const h = harness();
    h.queue.push(
      h.token(),
      json(200, { conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }),
      json(200, { conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }),
      json(200, meetEvent),
    );
    expect((await h.calendar.createEvent(request)).meetUrl).toBe(MEET);
    expect(h.sleep).toHaveBeenCalledTimes(2);
    const h2 = harness();
    h2.queue.push(h2.token(), json(200, {}), json(200, {}), json(200, {}), json(200, {}));
    expect(await code(h2.calendar.createEvent(request))).toEqual({
      code: 'CALENDAR_UNAVAILABLE',
      retryable: true,
    });
  });
});

describe('Google Takvim adaptörü: güncelleme ve silme', () => {
  it('saat değişikliği PATCH ile gider, davetlilere güncelleme e-postası (sendUpdates=all)', async () => {
    const h = harness();
    h.queue.push(h.token(), json(200));
    await h.calendar.updateEvent('mp123', {
      startsAt: new Date('2030-03-05T11:00:00.000Z'),
      endsAt: new Date('2030-03-05T11:30:00.000Z'),
    });
    const patch = h.calls[1]!;
    expect(patch.method).toBe('PATCH');
    expect(new URL(patch.url).pathname.endsWith('/events/mp123')).toBe(true);
    expect(new URL(patch.url).searchParams.get('sendUpdates')).toBe('all');
    expect(JSON.parse(patch.body!)).toEqual({
      start: { dateTime: '2030-03-05T11:00:00.000Z', timeZone: 'Europe/Istanbul' },
      end: { dateTime: '2030-03-05T11:30:00.000Z', timeZone: 'Europe/Istanbul' },
    });
    const h2 = harness();
    h2.queue.push(h2.token(), json(404));
    expect(
      await code(
        h2.calendar.updateEvent('yok', { startsAt: request.startsAt, endsAt: request.endsAt }),
      ),
    ).toEqual({ code: 'CALENDAR_REJECTED', retryable: false });
  });

  it('iptalde etkinlik silinir (sendUpdates=all); olmayan/silinmiş etkinlik başarıdır; sunucu hatası yeniden denenebilir', async () => {
    const h = harness();
    h.queue.push(h.token(), new Response(null, { status: 204 }));
    await h.calendar.deleteEvent('mp123');
    expect(h.calls[1]!.method).toBe('DELETE');
    expect(new URL(h.calls[1]!.url).searchParams.get('sendUpdates')).toBe('all');
    for (const status of [404, 410]) {
      const gone = harness();
      gone.queue.push(gone.token(), json(status));
      await expect(gone.calendar.deleteEvent('mp123')).resolves.toBeUndefined();
    }
    const broken = harness();
    broken.queue.push(broken.token(), json(500));
    expect(await code(broken.calendar.deleteEvent('mp123'))).toEqual({
      code: 'CALENDAR_UNAVAILABLE',
      retryable: true,
    });
  });
});

describe('Google Takvim adaptörü: jeton yönetimi', () => {
  it('erişim jetonu önbelleğe alınır, süresi dolmadan önce yenilenir; eşzamanlı çağrılar tek yenileme kullanır', async () => {
    const h = harness();
    h.queue.push(h.token(), json(200, meetEvent), json(200, meetEvent));
    await h.calendar.createEvent(request);
    await h.calendar.createEvent({ ...request, idempotencyKey: 'appointment:rnd-2' });
    expect(h.calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
    h.advance(3600 * 1000 - 30_000); // süresine 30 sn kaldı: pay (60 sn) içinde → yenilenir
    h.queue.push(h.token(), json(200, meetEvent));
    await h.calendar.createEvent({ ...request, idempotencyKey: 'appointment:rnd-3' });
    expect(h.calls.filter((c) => c.url.includes('oauth2')).length).toBe(2);

    const parallel = harness();
    parallel.queue.push(
      parallel.token(),
      json(200, meetEvent),
      json(200, meetEvent),
      json(200, meetEvent),
    );
    await Promise.all(
      ['a', 'b', 'c'].map((k) =>
        parallel.calendar.createEvent({ ...request, idempotencyKey: `appointment:${k}` }),
      ),
    );
    expect(parallel.calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
  });

  it('401: jeton yenilenip bir kez tekrar denenir; yine 401 ise bağlı değil sayılır', async () => {
    const h = harness();
    h.queue.push(h.token(), json(401), h.token(), json(200, meetEvent));
    expect((await h.calendar.createEvent(request)).meetUrl).toBe(MEET);
    const h2 = harness();
    h2.queue.push(h2.token(), json(401), h2.token(), json(401));
    expect(await code(h2.calendar.createEvent(request))).toEqual({
      code: 'CALENDAR_NOT_CONNECTED',
      retryable: false,
    });
  });

  it('yenileme jetonu reddedilirse (invalid_grant) bağlantı işaretlenir ve yeniden denenmez', async () => {
    const h = harness();
    h.queue.push(json(400, { error: 'invalid_grant' }));
    expect(await code(h.calendar.createEvent(request))).toEqual({
      code: 'CALENDAR_NOT_CONNECTED',
      retryable: false,
    });
    expect(h.rejected).toHaveBeenCalledTimes(1);
    expect(h.calls).toHaveLength(1);
  });

  it('bağlantı yoksa ya da jeton çözülemiyorsa Google çağrılmaz', async () => {
    for (const loadRefreshToken of [
      async () => null,
      async () => Promise.reject(new Error('çözülemedi')),
    ]) {
      const h = harness({ loadRefreshToken });
      expect(await code(h.calendar.createEvent(request))).toEqual({
        code: 'CALENDAR_NOT_CONNECTED',
        retryable: false,
      });
      expect(h.calls).toHaveLength(0);
    }
  });

  it('yanlış istemci sırrı kalıcı reddir; Google 5xx/429 yeniden denenebilir', async () => {
    const h = harness();
    h.queue.push(json(401, { error: 'invalid_client' }));
    expect(await code(h.calendar.createEvent(request))).toEqual({
      code: 'CALENDAR_REJECTED',
      retryable: false,
    });
    expect(h.rejected).not.toHaveBeenCalled();
    for (const status of [429, 503]) {
      const retry = harness();
      retry.queue.push(json(status));
      expect(await code(retry.calendar.createEvent(request))).toEqual({
        code: 'CALENDAR_UNAVAILABLE',
        retryable: true,
      });
    }
  });
});

describe('Google Takvim adaptörü: hata sınıfları ve gizlilik', () => {
  it('Takvim 400/403 kalıcı red, 429/5xx geçici; ağ hatası geçici; iptal/zaman aşımı TIMEOUT', async () => {
    const cases: [Reply, { code: string; retryable: boolean }][] = [
      [json(400), { code: 'CALENDAR_REJECTED', retryable: false }],
      [json(403), { code: 'CALENDAR_REJECTED', retryable: false }],
      [json(429), { code: 'CALENDAR_UNAVAILABLE', retryable: true }],
      [json(502), { code: 'CALENDAR_UNAVAILABLE', retryable: true }],
      [new TypeError('fetch failed'), { code: 'CALENDAR_UNAVAILABLE', retryable: true }],
      [
        Object.assign(new Error('aborted'), { name: 'TimeoutError' }),
        { code: 'CALENDAR_TIMEOUT', retryable: true },
      ],
      [
        Object.assign(new Error('aborted'), { name: 'AbortError' }),
        { code: 'CALENDAR_TIMEOUT', retryable: true },
      ],
    ];
    for (const [reply, expected] of cases) {
      const h = harness();
      h.queue.push(h.token(), reply);
      expect(await code(h.calendar.createEvent(request))).toEqual(expected);
    }
  });

  it('hata nesnesi ve loglar jeton, e-posta ya da sağlayıcı gövdesi taşımaz; adaptör hiçbir şey loglamaz', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const leaky = json(500, {
      error: { message: `kötü ${ACCESS} ${REFRESH} mentor@test.mezunportal.local` },
    });
    const h = harness();
    h.queue.push(h.token(), leaky);
    let thrown: unknown;
    try {
      await h.calendar.createEvent(request);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CalendarError);
    const dump =
      JSON.stringify(thrown) + String((thrown as Error).message) + String((thrown as Error).stack);
    for (const secret of [ACCESS, REFRESH, 'mentor@test', 'istemci-sirri', 'kötü'])
      expect(dump, secret).not.toContain(secret);
    expect((thrown as Error).message).toBe('CALENDAR_UNAVAILABLE');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
