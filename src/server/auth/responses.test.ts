import { describe, expect, it } from 'vitest';

import { authErrorCodeFor, mapAuthResponse } from './responses';

const redirect = (location: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 302, headers: { location, ...headers } });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('authErrorCodeFor', () => {
  it.each([
    ['INVALID_TOKEN', '/api/auth/magic-link/verify', 'AUTH_LINK_INVALID'],
    ['EXPIRED_TOKEN', '/api/auth/magic-link/verify', 'AUTH_LINK_INVALID'],
    ['invalid_token', '/api/auth/verify-email', 'AUTH_LINK_INVALID'],
    ['BANNED_USER', '/api/auth/magic-link/verify', 'AUTH_ACCOUNT_SUSPENDED'],
    ['banned', '/api/auth/callback/linkedin', 'AUTH_ACCOUNT_SUSPENDED'],
    ['429', '/api/auth/magic-link/verify', 'AUTH_IP_RATE_LIMITED'],
    ['access_denied', '/api/auth/callback/linkedin', 'AUTH_PROVIDER_FAILED'],
    ['unable_to_link_account', '/api/auth/callback/linkedin', 'AUTH_PROVIDER_FAILED'],
    ['bilinmeyen', '/api/auth/magic-link/verify', 'AUTH_LINK_INVALID'],
    [null, '/api/auth/callback/linkedin', 'AUTH_PROVIDER_FAILED'],
  ])('%s %s → %s', (raw, path, code) => {
    expect(authErrorCodeFor(raw, path)).toBe(code);
  });
});

describe('mapAuthResponse', () => {
  it('?error= içeren yönlendirmeyi ?hata=<ErrorCode>e çevirir, ham hata parametrelerini atar', async () => {
    const mapped = await mapAuthResponse(
      redirect('http://localhost:3162/giris?error=INVALID_TOKEN&error_description=x'),
      '/api/auth/magic-link/verify',
    );
    expect(mapped.status).toBe(302);
    expect(mapped.headers.get('location')).toBe(
      'http://localhost:3162/giris?hata=AUTH_LINK_INVALID',
    );
  });

  it('göreli yönlendirmeyi göreli tutar', async () => {
    const mapped = await mapAuthResponse(
      redirect('/giris?error=banned'),
      '/api/auth/callback/linkedin',
    );
    expect(mapped.headers.get('location')).toBe('/giris?hata=AUTH_ACCOUNT_SUSPENDED');
  });

  it('başarılı yönlendirmeyi (çerezli) olduğu gibi geçirir', async () => {
    const ok = redirect('http://localhost:3162/', {
      'set-cookie': 'mezun.session_token=abc; Path=/',
    });
    const mapped = await mapAuthResponse(ok, '/api/auth/magic-link/verify');
    expect(mapped).toBe(ok);
  });

  it('askıdaki kullanıcının 403 JSON yanıtını /giris?hata=AUTH_ACCOUNT_SUSPENDED yönlendirmesine çevirir; çerez taşımaz', async () => {
    const forbidden = json(403, { code: 'BANNED_USER', message: 'You have been banned' });
    forbidden.headers.append('set-cookie', 'x=1');
    const mapped = await mapAuthResponse(forbidden, '/api/auth/magic-link/verify');
    expect(mapped.status).toBe(302);
    expect(mapped.headers.get('location')).toBe('/giris?hata=AUTH_ACCOUNT_SUSPENDED');
    expect(mapped.headers.get('set-cookie')).toBeNull();
  });

  it('hız sınırı (429) AUTH_IP_RATE_LIMITED; diğer hatalar bağlantı geçersiz / sağlayıcı hatası', async () => {
    expect(
      (await mapAuthResponse(json(429, {}), '/api/auth/magic-link/verify')).headers.get('location'),
    ).toBe('/giris?hata=AUTH_IP_RATE_LIMITED');
    expect(
      (await mapAuthResponse(json(500, {}), '/api/auth/magic-link/verify')).headers.get('location'),
    ).toBe('/giris?hata=AUTH_LINK_INVALID');
    expect(
      (
        await mapAuthResponse(new Response('html', { status: 400 }), '/api/auth/callback/linkedin')
      ).headers.get('location'),
    ).toBe('/giris?hata=AUTH_PROVIDER_FAILED');
  });

  it('hata yanıtının gövdesi (ham ileti) yönlendirmeye sızmaz', async () => {
    const mapped = await mapAuthResponse(
      json(403, { code: 'BANNED_USER', message: 'gizli ayrıntı' }),
      '/api/auth/magic-link/verify',
    );
    expect(await mapped.text()).toBe('');
    expect(mapped.headers.get('location')).not.toContain('gizli');
  });
});
