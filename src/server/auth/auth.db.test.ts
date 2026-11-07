import { afterAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import {
  createTestAuth,
  cookieHeaderFrom,
  signInWithMagicLink,
  testAuthEnv,
  uniqueAddress,
} from '@/test/auth';
import { addMembership, createInstitution, createUser } from '@/test/fixtures';

import { createPermissions } from '../permissions/guards';
import { mapAuthResponse } from './responses';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const verifyUrl = (url: string) => new URL(url).searchParams.get('token') ?? '';

describe('e-posta bağlantısıyla giriş (gerçek Better Auth + gerçek veritabanı)', () => {
  it('yeni üye: bağlantı → oturum; e-posta doğrulanmış, ad türetilmiş, IP/user-agent saklanmamış', async () => {
    const { auth, sent } = createTestAuth(prisma);
    const address = uniqueAddress('ornek.test', 'yeni.uye');

    const { headers } = await signInWithMagicLink(auth, sent, address);
    const session = await auth.api.getSession({ headers });

    expect(session?.user).toMatchObject({ email: address, emailVerified: true });
    expect(session?.user.name).toMatch(/^yeni uye/);
    const row = await prisma.session.findFirstOrThrow({ where: { userId: session?.user.id } });
    expect(row.ipAddress).toBeNull();
    expect(row.userAgent).toBeNull();
  });

  it('bağlantı tek kullanımlıktır; ikinci tıklama geçersiz bağlantı (INVALID_TOKEN) yönlendirmesidir', async () => {
    const { auth, sent } = createTestAuth(prisma);
    const address = uniqueAddress('ornek.test');
    await auth.api.signInMagicLink({
      body: { email: address, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
    });
    const token = verifyUrl(sent.signInLinks[0]?.url ?? '');
    const click = () =>
      auth.api.magicLinkVerify({
        query: { token, callbackURL: '/', errorCallbackURL: '/giris' },
        headers: new Headers(),
        asResponse: true,
      });

    const first = await click();
    const second = await click();

    expect(first.status).toBe(302);
    expect(first.headers.getSetCookie().length).toBeGreaterThan(0);
    expect(second.headers.get('location')).toContain('error=INVALID_TOKEN');
    expect(second.headers.getSetCookie()).toHaveLength(0);
    // Ekranın göreceği biçim:
    const mapped = await mapAuthResponse(second, '/api/auth/magic-link/verify');
    expect(new URL(mapped.headers.get('location') ?? '', 'http://x').search).toBe(
      '?hata=AUTH_LINK_INVALID',
    );
  });

  it('süresi dolan bağlantı geçersizdir', async () => {
    const { auth, sent } = createTestAuth(prisma);
    await auth.api.signInMagicLink({
      body: { email: uniqueAddress('ornek.test'), callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
    });
    const token = verifyUrl(sent.signInLinks[0]?.url ?? '');
    await prisma.verification.updateMany({
      where: { identifier: { startsWith: 'magic-link:' }, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await auth.api.magicLinkVerify({
      query: { token, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
      asResponse: true,
    });

    expect(response.headers.get('location')).toContain('error=');
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('jeton veritabanında düz saklanmaz (özet) ve kullanılınca satır silinir', async () => {
    const { auth, sent } = createTestAuth(prisma);
    const address = uniqueAddress('ornek.test');
    await auth.api.signInMagicLink({
      body: { email: address, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
    });
    const token = verifyUrl(sent.signInLinks[0]?.url ?? '');

    const rows = await prisma.verification.findMany({ where: { value: { contains: address } } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identifier).not.toContain(token);

    await auth.api.magicLinkVerify({
      query: { token, callbackURL: '/' },
      headers: new Headers(),
      asResponse: true,
    });
    expect(await prisma.verification.count({ where: { value: { contains: address } } })).toBe(0);
  });

  it('askıdaki kullanıcı bağlantıya tıklasa da oturum AÇAMAZ; ekran /giris?hata=AUTH_ACCOUNT_SUSPENDED görür', async () => {
    const { auth, sent } = createTestAuth(prisma);
    const address = uniqueAddress('ornek.test');
    await signInWithMagicLink(auth, sent, address); // kullanıcı oluşsun
    await prisma.user.update({
      where: { email: address },
      data: { banned: true, banReason: 'test' },
    });
    const sessionsBefore = await prisma.session.count({ where: { user: { email: address } } });

    await auth.api.signInMagicLink({
      body: { email: address, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
    });
    const token = verifyUrl(sent.signInLinks[sent.signInLinks.length - 1]?.url ?? '');
    const response = await auth.api.magicLinkVerify({
      query: { token, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
      asResponse: true,
    });
    const mapped = await mapAuthResponse(response, '/api/auth/magic-link/verify');

    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(mapped.headers.get('location')).toBe('/giris?hata=AUTH_ACCOUNT_SUSPENDED');
    expect(await prisma.session.count({ where: { user: { email: address } } })).toBe(
      sessionsBefore,
    );
  });

  it('süresi dolmuş askı kalkar ve kullanıcı girebilir', async () => {
    const { auth, sent } = createTestAuth(prisma);
    const address = uniqueAddress('ornek.test');
    await signInWithMagicLink(auth, sent, address);
    await prisma.user.update({
      where: { email: address },
      data: { banned: true, banExpires: new Date(Date.now() - 60_000) },
    });

    const { headers } = await signInWithMagicLink(auth, sent, address);
    expect((await auth.api.getSession({ headers }))?.user.email).toBe(address);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: address } })).banned).toBe(false);
  });

  it('oturum açıkken askıya alınan kullanıcı yetki katmanından hemen düşer (çerez önbelleği yok)', async () => {
    const { auth, sent } = createTestAuth(prisma);
    const inst = await createInstitution(prisma);
    const address = uniqueAddress('ornek.test');
    const { headers } = await signInWithMagicLink(auth, sent, address);
    const userId = (await auth.api.getSession({ headers }))?.user.id ?? '';
    await addMembership(prisma, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2025,
    });
    const permissions = createPermissions({
      db: () => prisma,
      getSessionUserId: async () => (await auth.api.getSession({ headers }))?.user.id ?? null,
      now: () => new Date(),
    });
    await expect(permissions.requireVerifiedMember()).resolves.toBeDefined();

    await prisma.user.update({ where: { id: userId }, data: { banned: true } });

    const error = await permissions.requireUser().then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(isCodedError(error) && error.code).toBe('AUTH_ACCOUNT_SUSPENDED');
  });

  it('geçersiz/yok çerez oturum vermez', async () => {
    const { auth } = createTestAuth(prisma);
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
    expect(
      await auth.api.getSession({
        headers: new Headers({ cookie: 'mezun.session_token=sahte.imza' }),
      }),
    ).toBeNull();
  });
});

describe('oturum çerezi', () => {
  it('httpOnly + sameSite=lax; yerelde secure değil, canlıda (prod) secure', async () => {
    const local = createTestAuth(prisma);
    const address = uniqueAddress('ornek.test');
    await local.auth.api.signInMagicLink({
      body: { email: address, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
    });
    const response = await local.auth.api.magicLinkVerify({
      query: { token: verifyUrl(local.sent.signInLinks[0]?.url ?? ''), callbackURL: '/' },
      headers: new Headers(),
      asResponse: true,
    });
    const cookie = response.headers.getSetCookie().find((c) => c.startsWith('mezun.session_token'));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/;\s*Secure/i);

    const prod = createTestAuth(
      prisma,
      testAuthEnv({
        APP_ENV: 'prod',
        BETTER_AUTH_SECRET: 'x'.repeat(48),
        APP_URL: 'https://mezun.example.test',
      }),
    );
    const prodAddress = uniqueAddress('ornek.test');
    await prod.auth.api.signInMagicLink({
      body: { email: prodAddress, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
    });
    const prodResponse = await prod.auth.api.magicLinkVerify({
      query: { token: verifyUrl(prod.sent.signInLinks[0]?.url ?? ''), callbackURL: '/' },
      headers: new Headers(),
      asResponse: true,
    });
    const prodCookie = prodResponse.headers.getSetCookie().find((c) => c.includes('session_token'));
    expect(prodCookie).toMatch(/HttpOnly/i);
    expect(prodCookie).toMatch(/SameSite=Lax/i);
    expect(prodCookie).toMatch(/;\s*Secure/i);
  });
});

describe('admin eklentisi: “başka kullanıcı gibi giriş” ve yönetim uçları KAPALI', () => {
  it.each(['admin', 'ADMIN', 'superadmin', 'user'])(
    'User.role = %j olan oturum impersonate/setRole/removeUser/banUser yapamaz',
    async (role) => {
      const { auth, sent } = createTestAuth(prisma);
      const { headers } = await signInWithMagicLink(auth, sent, uniqueAddress('ornek.test'));
      const me = (await auth.api.getSession({ headers }))?.user.id ?? '';
      await prisma.user.update({ where: { id: me }, data: { role } });
      const victim = await createUser(prisma);

      const attempts: (() => Promise<unknown>)[] = [
        () => auth.api.impersonateUser({ body: { userId: victim }, headers }),
        // Rol adı tipi yalnız 'user'a izin verir; saldırgan her değeri gönderebilir.
        () => auth.api.setRole({ body: { userId: victim, role: 'admin' as never }, headers }),
        () => auth.api.removeUser({ body: { userId: victim }, headers }),
        () => auth.api.banUser({ body: { userId: victim }, headers }),
        () => auth.api.listUsers({ query: {}, headers }),
      ];
      for (const attempt of attempts) {
        await expect(attempt()).rejects.toMatchObject({ statusCode: 403 });
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: victim } })).banned).toBe(false);
      expect(
        await prisma.session.count({ where: { userId: victim, impersonatedBy: { not: null } } }),
      ).toBe(0);
    },
  );
});

describe('oturum açık kullanıcı yetkisi veritabanından gelir, çerezdeki iddiadan değil', () => {
  it('çerezi başka birinin oturum jetonuna çevirmek imza kontrolünden geçmez', async () => {
    const { auth, sent } = createTestAuth(prisma);
    const { cookie } = await signInWithMagicLink(auth, sent, uniqueAddress('ornek.test'));
    const [name, value = ''] = cookie.split('=');
    const tampered = `${name}=${value.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'))}`;
    expect(await auth.api.getSession({ headers: new Headers({ cookie: tampered }) })).toBeNull();
  });
});

describe('çıkış', () => {
  it('oturum silinir; aynı çerezle artık oturum yoktur', async () => {
    const { auth, sent } = createTestAuth(prisma);
    const { headers } = await signInWithMagicLink(auth, sent, uniqueAddress('ornek.test'));
    const response = await auth.api.signOut({ headers, asResponse: true });
    expect(cookieHeaderFrom(response)).toBeDefined();
    expect(await auth.api.getSession({ headers })).toBeNull();
  });
});
