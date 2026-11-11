import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codedForbidden, codedUnauthenticated } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  begin: vi.fn(),
  complete: vi.fn(),
  appUrl: { value: 'https://mezunportal.example' },
}));
vi.mock('@/server/permissions', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/server/db', () => ({ getDb: () => ({ marker: 'db' }) }));
vi.mock('@/lib/env', () => ({ getAuthEnv: () => ({ APP_URL: mocks.appUrl.value }) }));
vi.mock('@/server/external/calendar', () => ({ resetCalendar: vi.fn() }));
vi.mock('@/server/services/google-calendar-connection', () => ({
  beginGoogleAuthorization: mocks.begin,
  completeGoogleAuthorization: mocks.complete,
}));

import { GET as callback } from './callback/route';
import { GET as connect } from './connect/route';

const START = {
  url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=abc',
  nonce: 'abc',
  cookie: { value: 'yuk.imza', maxAgeSeconds: 600 },
};
const callbackRequest = (query: string, cookie?: string) =>
  new NextRequest(`https://mezunportal.example/api/google/callback?${query}`, {
    headers: cookie ? { cookie: `mp_google_oauth=${cookie}` } : {},
  });

beforeEach(() => {
  mocks.appUrl.value = 'https://mezunportal.example';
  mocks.requireAdmin.mockReset().mockResolvedValue({ userId: 'yonetici-1' });
  mocks.begin.mockReset().mockResolvedValue(START);
  mocks.complete.mockReset().mockResolvedValue('connected');
});

describe('GET /api/google/connect', () => {
  it('sistem yöneticisini Google izin ekranına yönlendirir ve imzalı, httpOnly durum çerezini koyar', async () => {
    const response = await connect();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(START.url);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({ kind: 'SYSTEM' });
    expect(mocks.begin).toHaveBeenCalledWith({ db: { marker: 'db' } }, 'yonetici-1');
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('mp_google_oauth=yuk.imza');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\/api\/google/);
    expect(cookie).toMatch(/Max-Age=600/);
    expect(cookie).toMatch(/Secure/i);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('yerel http adresinde Secure bayrağı konmaz (yerel geliştirme çalışsın)', async () => {
    mocks.appUrl.value = 'http://localhost:3175';
    expect((await connect()).headers.get('set-cookie')).not.toMatch(/Secure/i);
  });

  it("oturumsuz kullanıcı girişe (dönüş yoluyla), yetkisiz kullanıcı 403 alır; Google'a gidilmez ve çerez konmaz", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    const unauthenticated = await connect();
    expect(unauthenticated.status).toBe(303);
    expect(unauthenticated.headers.get('location')).toBe(
      'https://mezunportal.example/giris?donus=%2Fyonetim%2Fgoogle',
    );
    mocks.requireAdmin.mockRejectedValueOnce(codedForbidden('AUTH_FORBIDDEN'));
    const forbidden = await connect();
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('set-cookie')).toBeNull();
    expect(forbidden.headers.get('location')).toBeNull();
  });

  it("anahtar tanımlı değilse Google'a gitmeden yönetim sayfasına döner", async () => {
    mocks.begin.mockResolvedValueOnce(null);
    const response = await connect();
    expect(response.headers.get('location')).toBe(
      'https://mezunportal.example/yonetim/google?durum=not-configured',
    );
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

describe('GET /api/google/callback', () => {
  it("kodu, state'i ve çerezi servise verir; yalnız sonuç anahtarıyla yönetim sayfasına döner ve çerezi siler", async () => {
    const response = await callback(callbackRequest('code=GIZLI-KOD&state=abc', 'yuk.imza'));
    expect(mocks.complete).toHaveBeenCalledWith(
      { db: { marker: 'db' }, onChanged: expect.any(Function) },
      'yonetici-1',
      {
        code: 'GIZLI-KOD',
        state: 'abc',
        error: null,
        cookieValue: 'yuk.imza',
      },
    );
    expect(response.status).toBe(303);
    const location = response.headers.get('location') ?? '';
    expect(location).toBe('https://mezunportal.example/yonetim/google?durum=connected');
    expect(location).not.toContain('GIZLI-KOD');
    expect(location).not.toContain('abc');
    expect(response.headers.get('set-cookie')).toMatch(/mp_google_oauth=;/);
    expect(response.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('servisin sonucu (reddedildi, geçersiz…) yönlendirmeye aynen taşınır; Google hatası parametresi iletilir', async () => {
    mocks.complete.mockResolvedValueOnce('denied');
    const denied = await callback(callbackRequest('error=access_denied&state=abc', 'yuk.imza'));
    expect(denied.headers.get('location')).toContain('durum=denied');
    expect(mocks.complete.mock.calls.at(-1)![2]).toMatchObject({
      error: 'access_denied',
      code: null,
    });
    mocks.complete.mockResolvedValueOnce('invalid');
    const noCookie = await callback(callbackRequest('code=k&state=abc'));
    expect(noCookie.headers.get('location')).toContain('durum=invalid');
    expect(mocks.complete.mock.calls.at(-1)![2]).toMatchObject({ cookieValue: null });
  });

  it('oturumsuz kullanıcı girişe gider, yetkisiz kullanıcı 403 alır ve servis hiç çağrılmaz', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(codedUnauthenticated('AUTH_UNAUTHENTICATED'));
    expect(
      (await callback(callbackRequest('code=k&state=abc', 'c'))).headers.get('location'),
    ).toContain('/giris?donus=');
    mocks.requireAdmin.mockRejectedValueOnce(codedForbidden('AUTH_FORBIDDEN'));
    expect((await callback(callbackRequest('code=k&state=abc', 'c'))).status).toBe(403);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('servis beklenmeyen hata verirse 500 döner ve ayrıntı sızmaz', async () => {
    mocks.complete.mockRejectedValueOnce(new Error('GIZLI-1//jeton'));
    const response = await callback(callbackRequest('code=k&state=abc', 'c'));
    expect(response.status).toBe(500);
    expect(await response.text()).toBe('');
  });
});
