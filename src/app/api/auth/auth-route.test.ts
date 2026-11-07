import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ handler: vi.fn() }));
vi.mock('@/server/auth', () => ({ getAuth: () => ({ handler: mocks.handler }) }));

import { DELETE, GET, PATCH, POST, PUT } from './[...all]/route';

const request = (path: string, method = 'GET') =>
  new Request(`http://localhost:3000${path}`, { method });

beforeEach(() => mocks.handler.mockReset());

describe('/api/auth/[...all] (Better Auth HTTP yüzeyi)', () => {
  it.each([
    '/api/auth/admin/impersonate-user',
    '/api/auth/admin/set-role',
    '/api/auth/sign-in/magic-link',
    '/api/auth/sign-up/email',
    '/api/auth/list-sessions',
    '/api/auth/get-session',
    '/api/auth/test-login',
    '/api/auth',
  ])('GET %s → 404 ve Better Auth’a hiç iletilmez', async (path) => {
    const response = await GET(request(path));
    expect(response.status).toBe(404);
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it('POST/PUT/PATCH/DELETE her yolda 404 (bağlantı uçları yalnız GET)', async () => {
    for (const method of [POST, PUT, PATCH, DELETE]) {
      const response = await method();
      expect(response.status).toBe(404);
    }
    expect(mocks.handler).not.toHaveBeenCalled();
  });

  it('beyaz listedeki bağlantı ucu Better Auth’a iletilir; başarılı yanıt (çerez dahil) aynen geçer', async () => {
    const ok = new Response(null, {
      status: 302,
      headers: { location: '/', 'set-cookie': 'mezun.session_token=abc; Path=/' },
    });
    mocks.handler.mockResolvedValue(ok);

    const response = await GET(request('/api/auth/magic-link/verify?token=t&callbackURL=%2F'));

    expect(mocks.handler).toHaveBeenCalledTimes(1);
    expect(response).toBe(ok);
  });

  it('bağlantı hatası ekranın anladığı ?hata=<kod> yönlendirmesine çevrilir', async () => {
    mocks.handler.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: '/giris?error=INVALID_TOKEN' } }),
    );
    const response = await GET(request('/api/auth/magic-link/verify?token=eski'));
    expect(response.headers.get('location')).toBe('/giris?hata=AUTH_LINK_INVALID');
  });

  it('askıdaki kullanıcının 403’ü /giris?hata=AUTH_ACCOUNT_SUSPENDED yönlendirmesi olur', async () => {
    mocks.handler.mockResolvedValue(
      new Response(JSON.stringify({ code: 'BANNED_USER' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const response = await GET(request('/api/auth/magic-link/verify?token=t'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/giris?hata=AUTH_ACCOUNT_SUSPENDED');
  });
});
