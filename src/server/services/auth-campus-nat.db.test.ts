import { afterAll, describe, expect, it } from 'vitest';
import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createTestAuth, uniqueAddress } from '@/test/auth';
import { CHECK_EMAIL_RESPONSE } from '@/contracts/auth';
import { requestSignInLink } from './auth-flow';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

describe('kampüs NAT giriş sınırları', () => {
  it('aynı IP: 80 farklı bağlantı isteği ve gerçek HTTP doğrulaması; tek e-posta altıncıda sınırlı', async () => {
    const harness = createTestAuth(db);
    const ip = '198.51.100.237';
    const headers = new Headers({ 'x-forwarded-for': ip, origin: harness.env.APP_URL });
    const deps = { db, ...harness };
    for (let i = 0; i < 80; i += 1) {
      const email = uniqueAddress('kampus.test', 'sinif');
      const sentBefore = harness.sent.signInLinks.length;
      expect(await requestSignInLink(deps, { email, headers, clientIp: ip })).toEqual(
        CHECK_EMAIL_RESPONSE,
      );
      const link = harness.sent.signInLinks[sentBefore];
      expect(link, `bağlantı ${i + 1}`).toBeDefined();
      const response = await harness.auth.handler(new Request(link!.url, { headers }));
      expect(response.status, `doğrulama ${i + 1}`).toBeLessThan(400);
      expect(response.headers.get('set-cookie'), `oturum ${i + 1}`).toContain('session_token');
    }
    const email = uniqueAddress('kampus.test', 'limit');
    for (let i = 0; i < 5; i += 1) await requestSignInLink(deps, { email, headers, clientIp: ip });
    const error = await requestSignInLink(deps, { email, headers, clientIp: ip }).catch(
      (e: unknown) => e,
    );
    expect(isCodedError(error) && error.code).toBe('RATE_LIMITED');
  }, 90_000);
  it('HTTP eklentisi ve genel oturum uçları aynı IP altında 80 kullanıcıyı geçirir', async () => {
    const harness = createTestAuth(db);
    const headers = new Headers({
      'x-forwarded-for': '198.51.100.238',
      origin: harness.env.APP_URL,
      'content-type': 'application/json',
    });
    for (let i = 0; i < 80; i += 1) {
      const email = uniqueAddress('kampus-http.test', 'sinif');
      const before = harness.sent.signInLinks.length;
      const request = new Request(`${harness.env.APP_URL}/api/auth/sign-in/magic-link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, callbackURL: '/', errorCallbackURL: '/giris' }),
      });
      const sent = await harness.auth.handler(request);
      expect(sent.status, `HTTP bağlantı isteği ${i + 1}`).toBe(200);
      const link = harness.sent.signInLinks[before];
      expect(link).toBeDefined();
      const verify = await harness.auth.handler(new Request(link!.url, { headers }));
      expect(verify.status, `HTTP doğrulama ${i + 1}`).toBeLessThan(400);
      const cookie = verify.headers.get('set-cookie');
      expect(cookie).toContain('session_token');
      const session = await harness.auth.handler(
        new Request(`${harness.env.APP_URL}/api/auth/get-session`, {
          headers: { 'x-forwarded-for': '198.51.100.238', cookie: cookie!.split(';')[0]! },
        }),
      );
      expect(session.status, `HTTP oturum ${i + 1}`).toBe(200);
      expect((await session.json())?.user).toBeTruthy();
    }
  }, 90_000);
});
