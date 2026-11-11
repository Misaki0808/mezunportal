import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GOOGLE_CALENDAR_SCOPE,
  GoogleOAuthError,
  OAUTH_STATE_TTL_MS,
  buildAuthorization,
  exchangeCode,
  readCalendarLabel,
  redirectUriFor,
  revokeToken,
  verifyAuthorization,
} from './google-oauth';
import { createHash } from 'node:crypto';

const SECRET = 'oturum-sirri-en-az-otuz-iki-karakter-uzunlugunda-xx';
const OTHER_SECRET = 'baska-sir-en-az-otuz-iki-karakter-uzunlugunda-yyyy';
const APP = 'https://mezunportal.example';
const NOW = 1_800_000_000_000;
const REFRESH = '1//0gSECRET-yenileme';
const start = (userId = 'yonetici-1', now = NOW) =>
  buildAuthorization({ clientId: 'istemci', appUrl: APP, secret: SECRET, userId, now });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof GoogleOAuthError ? error.code : `BEKLENMEYEN:${String(error)}`;
  }
  return null;
};
afterEach(() => vi.restoreAllMocks());

describe('yetkilendirme adresi', () => {
  it('yalnız calendar.events kapsamı, çevrimdışı erişim, zorunlu rıza, state ve PKCE (S256) ister', () => {
    const { url, nonce, cookie } = start();
    const params = new URL(url).searchParams;
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    expect(params.get('scope')).toBe(GOOGLE_CALENDAR_SCOPE);
    expect(params.get('scope')).toBe('https://www.googleapis.com/auth/calendar.events');
    expect(params.get('access_type')).toBe('offline');
    expect(params.get('prompt')).toBe('consent');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe('istemci');
    expect(params.get('redirect_uri')).toBe('https://mezunportal.example/api/google/callback');
    expect(params.get('state')).toBe(nonce);
    expect(params.get('code_challenge_method')).toBe('S256');
    // challenge, çerezdeki doğrulayıcının SHA-256'sıdır; doğrulayıcı yönlendirme adresinde YOKTUR
    const { verifier } = verifyAuthorization({
      cookieValue: cookie.value,
      state: nonce,
      userId: 'yonetici-1',
      secret: SECRET,
      now: NOW,
    });
    expect(params.get('code_challenge')).toBe(
      createHash('sha256').update(verifier).digest('base64url'),
    );
    expect(url).not.toContain(verifier);
    expect(cookie.maxAgeSeconds).toBe(OAUTH_STATE_TTL_MS / 1000);
  });

  it("her çağrı yeni state ve doğrulayıcı üretir; yönlendirme adresi APP_URL'den kurulur", () => {
    expect(start().nonce).not.toBe(start().nonce);
    expect(redirectUriFor('http://localhost:3175')).toBe(
      'http://localhost:3175/api/google/callback',
    );
  });
});

describe('durum çerezi doğrulaması (CSRF)', () => {
  const verify = (over: Partial<Parameters<typeof verifyAuthorization>[0]> = {}) => {
    const s = start();
    return () =>
      verifyAuthorization({
        cookieValue: s.cookie.value,
        state: s.nonce,
        userId: 'yonetici-1',
        secret: SECRET,
        now: NOW + 1000,
        ...over,
      });
  };

  it('geçerli çerez + eşleşen state kabul edilir', () => {
    expect(code(verify())).toBeNull();
  });

  it('state uyuşmazlığı, başka yönetici, başka sır, bozuk/yok çerez reddedilir', () => {
    expect(code(verify({ state: 'baska-state' }))).toBe('GOOGLE_STATE_INVALID');
    expect(code(verify({ state: null }))).toBe('GOOGLE_STATE_INVALID');
    expect(code(verify({ userId: 'baska-yonetici' }))).toBe('GOOGLE_STATE_INVALID');
    expect(code(verify({ secret: OTHER_SECRET }))).toBe('GOOGLE_STATE_INVALID');
    expect(code(verify({ cookieValue: null }))).toBe('GOOGLE_STATE_INVALID');
    expect(code(verify({ cookieValue: 'a.b.c' }))).toBe('GOOGLE_STATE_INVALID');
    expect(code(verify({ cookieValue: 'yok' }))).toBe('GOOGLE_STATE_INVALID');
  });

  it('imzası ya da yükü kurcalanmış çerez reddedilir', () => {
    const s = start();
    const [payload, signature] = s.cookie.value.split('.');
    const forged = Buffer.from(
      JSON.stringify({ n: s.nonce, v: 'saldirgan', u: 'yonetici-1', e: NOW + 999_999_999 }),
    ).toString('base64url');
    for (const cookieValue of [
      `${forged}.${signature}`,
      `${payload}.${'A'.repeat(43)}`,
      `${payload}.`,
    ]) {
      expect(
        code(() =>
          verifyAuthorization({
            cookieValue,
            state: s.nonce,
            userId: 'yonetici-1',
            secret: SECRET,
            now: NOW,
          }),
        ),
      ).toBe('GOOGLE_STATE_INVALID');
    }
  });

  it('süresi dolan çerez reddedilir (10 dk)', () => {
    expect(code(verify({ now: NOW + OAUTH_STATE_TTL_MS + 1 }))).toBe('GOOGLE_STATE_EXPIRED');
    expect(code(verify({ now: NOW + OAUTH_STATE_TTL_MS - 1 }))).toBeNull();
  });
});

describe('kod değişimi', () => {
  const ok = {
    refresh_token: REFRESH,
    access_token: 'ya29.erisim',
    scope: `openid ${GOOGLE_CALENDAR_SCOPE}`,
  };
  const reply = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const exchange = (fetchImpl: typeof fetch) =>
    exchangeCode({
      clientId: 'istemci',
      clientSecret: 'sir',
      appUrl: APP,
      code: 'kod-1',
      verifier: 'dogrulayici',
      fetchImpl,
    });
  const failure = async (fetchImpl: typeof fetch) => {
    try {
      await exchange(fetchImpl);
    } catch (error) {
      return error as GoogleOAuthError;
    }
    return null;
  };

  it('kodu authorization_code + PKCE doğrulayıcısı ile değiştirir ve jetonları döner', async () => {
    let sent: URLSearchParams | undefined;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      sent = new URLSearchParams(String(init.body));
      return new Response(JSON.stringify(ok), { status: 200 });
    }) as unknown as typeof fetch;
    await expect(exchange(fetchImpl)).resolves.toEqual({
      refreshToken: REFRESH,
      accessToken: 'ya29.erisim',
      scope: `openid ${GOOGLE_CALENDAR_SCOPE}`,
    });
    expect(Object.fromEntries(sent!)).toEqual({
      grant_type: 'authorization_code',
      code: 'kod-1',
      client_id: 'istemci',
      client_secret: 'sir',
      redirect_uri: 'https://mezunportal.example/api/google/callback',
      code_verifier: 'dogrulayici',
    });
  });

  it('yenileme jetonu yoksa, kapsam eksikse, Google reddederse ya da ağ düşerse reddedilir', async () => {
    expect((await failure(reply(200, { ...ok, refresh_token: undefined })))?.code).toBe(
      'GOOGLE_NO_REFRESH_TOKEN',
    );
    expect((await failure(reply(200, { ...ok, scope: 'openid email' })))?.code).toBe(
      'GOOGLE_SCOPE_MISSING',
    );
    expect((await failure(reply(200, { ...ok, scope: undefined })))?.code).toBe(
      'GOOGLE_SCOPE_MISSING',
    );
    expect((await failure(reply(400, { error: 'invalid_grant' })))?.code).toBe(
      'GOOGLE_EXCHANGE_FAILED',
    );
    expect((await failure(reply(200, {})))?.code).toBe('GOOGLE_EXCHANGE_FAILED');
    expect(
      (await failure((async () => Promise.reject(new TypeError('ağ'))) as unknown as typeof fetch))
        ?.code,
    ).toBe('GOOGLE_EXCHANGE_FAILED');
  });

  it('hata mesajı kod, jeton ya da sağlayıcı gövdesi taşımaz', async () => {
    const error = await failure(
      reply(400, { error: `kötü ${REFRESH}`, error_description: 'kod-1' }),
    );
    expect(error?.message).toBe('GOOGLE_EXCHANGE_FAILED');
    expect(JSON.stringify(error) + String(error?.stack)).not.toContain(REFRESH);
  });
});

describe('etiket ve iptal (en iyi çaba)', () => {
  it('takvim adı okunur; başarısızlık ya da uygunsuz değer etiketi boş bırakır', async () => {
    const json = (status: number, body: unknown) =>
      (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await readCalendarLabel('t', json(200, { summary: ' platform@gmail.com ' }))).toBe(
      'platform@gmail.com',
    );
    expect(await readCalendarLabel('t', json(200, { summary: 'x'.repeat(201) }))).toBeNull();
    expect(await readCalendarLabel('t', json(403, {}))).toBeNull();
    expect(
      await readCalendarLabel('t', (async () =>
        Promise.reject(new Error('x'))) as unknown as typeof fetch),
    ).toBeNull();
  });

  it("jeton Google'da iptal edilir; hata sessizdir", async () => {
    let body = '';
    const okFetch = (async (url: string, init: RequestInit) => {
      expect(url).toBe('https://oauth2.googleapis.com/revoke');
      body = String(init.body);
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    expect(await revokeToken(REFRESH, okFetch)).toBe(true);
    expect(new URLSearchParams(body).get('token')).toBe(REFRESH);
    expect(
      await revokeToken(
        REFRESH,
        (async () => new Response(null, { status: 400 })) as unknown as typeof fetch,
      ),
    ).toBe(false);
    expect(
      await revokeToken(REFRESH, (async () =>
        Promise.reject(new Error('x'))) as unknown as typeof fetch),
    ).toBe(false);
  });
});
