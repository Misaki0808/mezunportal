import { createServer } from 'node:http';
import { once } from 'node:events';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createTestAuth, uniqueAddress } from '@/test/auth';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('aynı kampüs IP ile 80 gerçek HTTP isteği, doğrulama ve oturum', async () => {
  const h = createTestAuth(db);
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (let i = 0; i < req.rawHeaders.length; i += 2)
        headers.append(req.rawHeaders[i]!, req.rawHeaders[i + 1]!);
      const body = Buffer.concat(chunks);
      const response = await h.auth.handler(
        new Request(new URL(req.url!, h.env.APP_URL), {
          method: req.method,
          headers,
          ...(body.length ? { body } : {}),
        }),
      );
      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.statusCode = 500;
      res.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('port alınamadı');
  const base = `http://127.0.0.1:${address.port}`;
  const headers = {
    'x-forwarded-for': '198.51.100.239',
    origin: h.env.APP_URL,
    'content-type': 'application/json',
  };
  try {
    for (let i = 0; i < 80; i += 1) {
      const before = h.sent.signInLinks.length;
      const sent = await fetch(`${base}/api/auth/sign-in/magic-link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: uniqueAddress('sinif-http.test'),
          callbackURL: '/',
          errorCallbackURL: '/giris',
        }),
        redirect: 'manual',
      });
      expect(sent.status, `istek ${i + 1}`).toBe(200);
      const link = h.sent.signInLinks[before];
      expect(link).toBeDefined();
      const url = new URL(link!.url);
      const verified = await fetch(`${base}${url.pathname}${url.search}`, {
        headers,
        redirect: 'manual',
      });
      expect(verified.status, `doğrulama ${i + 1}`).toBeLessThan(400);
      const cookie = verified.headers.get('set-cookie');
      expect(cookie).toContain('session_token');
      const session = await fetch(`${base}/api/auth/get-session`, {
        headers: { 'x-forwarded-for': '198.51.100.239', cookie: cookie!.split(';')[0]! },
        redirect: 'manual',
      });
      expect(session.status, `oturum ${i + 1}`).toBe(200);
      expect((await session.json()).user).toBeTruthy();
    }
    for (let i = 80; i <= 120; i += 1) {
      const response = await fetch(`${base}/api/auth/sign-in/magic-link`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: uniqueAddress('sinif-http.test'), callbackURL: '/' }),
        redirect: 'manual',
      });
      expect(response.status, `istek ${i + 1}`).toBe(i === 120 ? 429 : 200);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}, 90_000);
