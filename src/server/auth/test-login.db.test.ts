import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { cookieHeaderFrom, createTestAuth, testAuthEnv } from '@/test/auth';

import { seedAccounts } from '../../../prisma/seed-accounts';
import { TEST_PERSONAS } from '../../../prisma/seed-data';
import { seedInstitutions } from '../../../prisma/seed-institutions';
import { TEST_LOGIN_PERSONAS } from '@/contracts/auth';
import { createPermissions } from '../permissions/guards';
import { TEST_PERSONA_EMAILS } from './test-personas';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

beforeAll(async () => {
  await seedInstitutions(prisma);
  await seedAccounts(prisma);
});

describe('test girişi (yalnız local/test)', () => {
  it('kişi e-postaları seed kullanıcılarıyla birebir aynıdır', () => {
    for (const persona of TEST_LOGIN_PERSONAS) {
      expect(TEST_PERSONA_EMAILS[persona]).toBe(TEST_PERSONAS[persona].email);
    }
  });

  it.each(['local', 'test'] as const)(
    '%s: seed kullanıcısı olarak oturum açılır (e-posta bağlantısı olmadan)',
    async (appEnv) => {
      const { auth, sent } = createTestAuth(prisma, testAuthEnv({ APP_ENV: appEnv }));

      const response = await auth.api.testLogin({
        body: { persona: 'student' },
        headers: new Headers(),
        asResponse: true,
      });
      const headers = new Headers({ cookie: cookieHeaderFrom(response) });
      const session = await auth.api.getSession({ headers });

      expect(session?.user.email).toBe(TEST_PERSONAS.student.email);
      expect(sent.signInLinks).toHaveLength(0); // e-posta gönderilmedi
      const permissions = createPermissions({
        db: () => prisma,
        getSessionUserId: async () => session?.user.id ?? null,
        now: () => new Date(),
      });
      await expect(
        permissions.requireVerifiedMember({ roles: ['STUDENT'] }),
      ).resolves.toBeDefined();
    },
  );

  it('her kişi kendi yetkisiyle girer: sistem yöneticisi yönetici, öğrenci değil', async () => {
    const { auth } = createTestAuth(prisma);
    const as = async (persona: (typeof TEST_LOGIN_PERSONAS)[number]) => {
      const response = await auth.api.testLogin({
        body: { persona },
        headers: new Headers(),
        asResponse: true,
      });
      const headers = new Headers({ cookie: cookieHeaderFrom(response) });
      return createPermissions({
        db: () => prisma,
        getSessionUserId: async () => (await auth.api.getSession({ headers }))?.user.id ?? null,
        now: () => new Date(),
      });
    };
    await expect((await as('systemAdmin')).requireAdmin({ kind: 'SYSTEM' })).resolves.toBeDefined();
    await expect((await as('student')).requireAdmin({ kind: 'SYSTEM' })).rejects.toMatchObject({
      code: 'AUTH_FORBIDDEN',
    });
    await expect((await as('seniorMentor')).requireMentor()).resolves.toBeDefined();
  });

  it('bilinmeyen kişi reddedilir (yalnız tanımlı anahtarlar)', async () => {
    const { auth } = createTestAuth(prisma);
    await expect(
      auth.api.testLogin({ body: { persona: 'admin' as never }, headers: new Headers() }),
    ).rejects.toBeDefined();
  });

  it('askıdaki test kullanıcısı bile test girişiyle oturum AÇAMAZ (ban kontrolü atlanmaz)', async () => {
    const { auth } = createTestAuth(prisma);
    await prisma.user.update({
      where: { email: TEST_PERSONAS.academic.email },
      data: { banned: true },
    });
    try {
      await expect(
        auth.api.testLogin({ body: { persona: 'academic' }, headers: new Headers() }),
      ).rejects.toMatchObject({ statusCode: 403 });
    } finally {
      await prisma.user.update({
        where: { email: TEST_PERSONAS.academic.email },
        data: { banned: false },
      });
    }
  });

  it('PROD’DA KOD YOLU YOK: eklenti yüklenmez, `testLogin` ucu hiç bulunmaz', async () => {
    const prod = createTestAuth(
      prisma,
      testAuthEnv({
        APP_ENV: 'prod',
        BETTER_AUTH_SECRET: 'x'.repeat(48),
        APP_URL: 'https://mezun.example.test',
      }),
    );
    expect('testLogin' in prod.auth.api).toBe(false);
    // HTTP yolundan da ulaşılamaz (Better Auth bilinmeyen yola 404 verir).
    const response = await prod.auth.handler(
      new Request('https://mezun.example.test/api/auth/test-login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://mezun.example.test' },
        body: JSON.stringify({ persona: 'systemAdmin' }),
      }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });
});
