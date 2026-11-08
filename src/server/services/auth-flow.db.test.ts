import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CHECK_EMAIL_RESPONSE, EMAIL_CHANGE_RETURN_PATHS } from '@/contracts/auth';
import { isCodedError, type ErrorCode } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createTestAuth, signInWithMagicLink, testAuthEnv, uniqueAddress } from '@/test/auth';
import {
  addMembership,
  createInstitution,
  createUser,
  unique,
  type Institution,
} from '@/test/fixtures';

import { loadActor } from '../permissions/actor';
import * as flow from './auth-flow';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

const NOW = new Date('2026-11-08T12:00:00Z');

async function codeOf(operation: Promise<unknown>): Promise<ErrorCode | 'OK'> {
  try {
    await operation;
    return 'OK';
  } catch (error) {
    if (isCodedError(error)) return error.code;
    throw error;
  }
}

async function actorOf(userId: string) {
  const actor = await loadActor(prisma, userId, NOW);
  if (!actor) throw new Error('Actor yok');
  return actor;
}

// Bu dosyadaki üniversitenin alan adları (benzersiz: diğer testlerin üniversiteleri karışmasın).
const STUDENT_DOMAIN = `ogr.${unique('uni')}.test`;
const STAFF_DOMAIN = `pers.${unique('uni')}.test`;
let inst: Institution;
let other: Institution; // başka üniversite (kendi alan adlarıyla)
const OTHER_STUDENT_DOMAIN = `ogr.${unique('baska')}.test`;

beforeAll(async () => {
  inst = await createInstitution(prisma, {
    studentEmailDomains: [STUDENT_DOMAIN],
    staffEmailDomains: [STAFF_DOMAIN],
  });
  other = await createInstitution(prisma, { studentEmailDomains: [OTHER_STUDENT_DOMAIN] });
});

async function userWithEmail(email: string, overrides: { emailVerified?: boolean } = {}) {
  const userId = await createUser(prisma, { email });
  if (overrides.emailVerified === false) {
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: false } });
  }
  return userId;
}

describe('declareMembership: alan adı ile öğrenci/akademisyen doğrulaması (D2)', () => {
  const deps = () => ({ db: prisma, ...createTestAuth(prisma), now: () => NOW });

  it('okul e-postalı öğrenci bölüm + giriş yılı ile DOĞRULANMIŞ öğrenci olur', async () => {
    const userId = await userWithEmail(uniqueAddress(STUDENT_DOMAIN, 'ogrenci'));
    const result = await flow.declareMembership(deps(), await actorOf(userId), {
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2025,
    });

    expect(result.status).toBe('VERIFIED');
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: result.membershipId },
    });
    expect(membership).toMatchObject({
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2025,
      verificationStatus: 'VERIFIED',
      verificationMethod: 'STUDENT_EMAIL',
      verifiedById: null,
      endedAt: null,
    });
  });

  it('kurumsal e-postalı akademisyen doğrulanır (giriş yılı yok)', async () => {
    const userId = await userWithEmail(uniqueAddress(STAFF_DOMAIN, 'hoca'));
    const result = await flow.declareMembership(deps(), await actorOf(userId), {
      role: 'ACADEMIC',
      departmentId: inst.deptA2,
    });
    const membership = await prisma.membership.findUniqueOrThrow({
      where: { id: result.membershipId },
    });
    expect(membership).toMatchObject({
      role: 'ACADEMIC',
      entryYear: null,
      verificationMethod: 'STAFF_EMAIL',
    });
  });

  it.each([
    ['öğrenci alan adıyla akademisyen olunamaz', STUDENT_DOMAIN, { role: 'ACADEMIC' as const }],
    [
      'personel alan adıyla öğrenci olunamaz',
      STAFF_DOMAIN,
      { role: 'STUDENT' as const, entryYear: 2024 },
    ],
  ])('%s', async (_label, domain, input) => {
    const userId = await userWithEmail(uniqueAddress(domain));
    const code = await codeOf(
      flow.declareMembership(deps(), await actorOf(userId), {
        departmentId: inst.deptA1,
        ...input,
      }),
    );
    expect(code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(await prisma.membership.count({ where: { userId } })).toBe(0);
  });

  it('başka üniversitenin alan adı bu üniversitenin bölümünü doğrulayamaz', async () => {
    const userId = await userWithEmail(uniqueAddress(OTHER_STUDENT_DOMAIN));
    expect(
      await codeOf(
        flow.declareMembership(deps(), await actorOf(userId), {
          role: 'STUDENT',
          departmentId: inst.deptA1,
          entryYear: 2025,
        }),
      ),
    ).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    // kendi üniversitesinin bölümünde olur
    expect(
      await codeOf(
        flow.declareMembership(deps(), await actorOf(userId), {
          role: 'STUDENT',
          departmentId: other.deptA1,
          entryYear: 2025,
        }),
      ),
    ).toBe('OK');
  });

  it.each([
    ['kişisel e-posta', () => uniqueAddress('gmail.test')],
    ['alt alan adı', () => uniqueAddress(`x.${STUDENT_DOMAIN}`)],
    ['benzer alan adı', () => uniqueAddress(`evil-${STUDENT_DOMAIN}`)],
    ['alan adı sonuna eklenmiş', () => uniqueAddress(`${STUDENT_DOMAIN}.evil.test`)],
  ])('alan adıyla doğrulanamaz: %s', async (_label, address) => {
    const userId = await userWithEmail(address());
    expect(
      await codeOf(
        flow.declareMembership(deps(), await actorOf(userId), {
          role: 'STUDENT',
          departmentId: inst.deptA1,
          entryYear: 2025,
        }),
      ),
    ).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
  });

  it('e-postası doğrulanmamış hesap alan adıyla üyelik alamaz', async () => {
    const userId = await userWithEmail(uniqueAddress(STUDENT_DOMAIN), { emailVerified: false });
    expect(
      await codeOf(
        flow.declareMembership(deps(), await actorOf(userId), {
          role: 'STUDENT',
          departmentId: inst.deptA1,
          entryYear: 2025,
        }),
      ),
    ).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
  });

  it('var olmayan bölüm RESOURCE_NOT_FOUND', async () => {
    const userId = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    expect(
      await codeOf(
        flow.declareMembership(deps(), await actorOf(userId), {
          role: 'STUDENT',
          departmentId: 'yok-yok',
          entryYear: 2025,
        }),
      ),
    ).toBe('RESOURCE_NOT_FOUND');
  });

  it('aynı bölümde ikinci beyan MEMBERSHIP_ALREADY_VERIFIED; EŞZAMANLI iki beyandan yalnız biri üyelik açar', async () => {
    const userId = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    const actor = await actorOf(userId);
    const declare = () =>
      flow.declareMembership(deps(), actor, {
        role: 'STUDENT',
        departmentId: inst.deptB1,
        entryYear: 2025,
      });

    const results = await Promise.allSettled([declare(), declare(), declare()]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const failed of results.filter((r) => r.status === 'rejected')) {
      expect(isCodedError(failed.reason) && failed.reason.code).toBe('MEMBERSHIP_ALREADY_VERIFIED');
    }
    expect(
      await prisma.membership.count({
        where: { userId, departmentId: inst.deptB1, endedAt: null },
      }),
    ).toBe(1);
    expect(await codeOf(declare())).toBe('MEMBERSHIP_ALREADY_VERIFIED');
  });

  it('farklı bölümde ikinci öğrenci üyeliği serbest (çoklu rol/bölüm)', async () => {
    const userId = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    const actor = await actorOf(userId);
    await flow.declareMembership(deps(), actor, {
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2025,
    });
    await flow.declareMembership(deps(), actor, {
      role: 'STUDENT',
      departmentId: inst.deptA2,
      entryYear: 2024,
    });
    expect(await prisma.membership.count({ where: { userId, endedAt: null } })).toBe(2);
  });

  it('bekleyen (doğrulanmamış) etkin öğrenci üyeliği varsa aynı satır doğrulanır, ikinci satır açılmaz', async () => {
    const userId = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    const pendingId = await addMembership(prisma, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      status: 'PENDING',
    });
    const result = await flow.declareMembership(deps(), await actorOf(userId), {
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2025,
    });
    expect(result.membershipId).toBe(pendingId);
    expect(await prisma.membership.count({ where: { userId } })).toBe(1);
  });

  it('istemci kimliği/rolü taşıyamaz: üyelik daima oturumdaki kullanıcıya yazılır', async () => {
    const mine = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    const victim = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    const result = await flow.declareMembership(deps(), await actorOf(mine), {
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2025,
    });
    expect(
      (await prisma.membership.findUniqueOrThrow({ where: { id: result.membershipId } })).userId,
    ).toBe(mine);
    expect(await prisma.membership.count({ where: { userId: victim } })).toBe(0);
  });
});

describe('listSelectableDepartments (PM kararı: kayıtta bölüm seçimi)', () => {
  it('alan adı üniversiteyi gösteriyorsa YALNIZ o üniversitenin bölümleri döner', async () => {
    const userId = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    const result = await flow.listSelectableDepartments(prisma, await actorOf(userId));

    expect(result.scope).toBe('EMAIL_DOMAIN');
    expect(result.departments.map((d) => d.id).sort()).toEqual(
      [inst.deptA1, inst.deptA2, inst.deptB1].sort(),
    );
    expect(
      result.departments.every((d) => d.universityName.length > 0 && d.facultyName.length > 0),
    ).toBe(true);
  });

  it('personel alan adı da kendi üniversitesini gösterir', async () => {
    const userId = await userWithEmail(uniqueAddress(STAFF_DOMAIN));
    const result = await flow.listSelectableDepartments(prisma, await actorOf(userId));
    expect(result.scope).toBe('EMAIL_DOMAIN');
    expect(result.departments.map((d) => d.id)).toContain(inst.deptA1);
    expect(result.departments.map((d) => d.id)).not.toContain(other.deptA1);
  });

  it('kişisel e-postalı mezun BÜTÜN bölümleri görür (alan adı üniversiteyi göstermez)', async () => {
    const userId = await userWithEmail(uniqueAddress('gmail.test', 'mezun'));
    const result = await flow.listSelectableDepartments(prisma, await actorOf(userId));

    expect(result.scope).toBe('ALL');
    const ids = result.departments.map((d) => d.id);
    for (const id of [inst.deptA1, inst.deptA2, inst.deptB1, other.deptA1])
      expect(ids).toContain(id);
  });

  it('sıra: üniversite, fakülte, bölüm adı (tr-TR); yanıtta e-posta/alan adı yok', async () => {
    const userId = await userWithEmail(uniqueAddress('gmail.test'));
    const result = await flow.listSelectableDepartments(prisma, await actorOf(userId));
    const keys = result.departments.map((d) => `${d.universityName}|${d.facultyName}|${d.name}`);
    const collator = new Intl.Collator('tr-TR');
    expect(
      [...keys].sort((a, b) => {
        const [ua, fa, na] = a.split('|');
        const [ub, fb, nb] = b.split('|');
        return (
          collator.compare(ua ?? '', ub ?? '') ||
          collator.compare(fa ?? '', fb ?? '') ||
          collator.compare(na ?? '', nb ?? '')
        );
      }),
    ).toEqual(keys);
    expect(JSON.stringify(result)).not.toContain('Domains');
  });
});

describe('getVerificationState', () => {
  it('yeni kullanıcı: NOT_STARTED ve e-posta sınıfı alan adından', async () => {
    const student = await flow.getVerificationState(
      prisma,
      await actorOf(await userWithEmail(uniqueAddress(STUDENT_DOMAIN))),
    );
    const staff = await flow.getVerificationState(
      prisma,
      await actorOf(await userWithEmail(uniqueAddress(STAFF_DOMAIN))),
    );
    const personal = await flow.getVerificationState(
      prisma,
      await actorOf(await userWithEmail(uniqueAddress('gmail.test'))),
    );

    expect(student).toMatchObject({
      status: 'NOT_STARTED',
      emailKind: 'STUDENT_DOMAIN',
      memberships: [],
      pendingDocument: null,
      rejection: null,
    });
    expect(staff.emailKind).toBe('STAFF_DOMAIN');
    expect(personal.emailKind).toBe('OTHER');
  });

  it('beyandan sonra VERIFIED ve üyelik özeti bölüm adıyla gelir', async () => {
    const userId = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    const actor = await actorOf(userId);
    await flow.declareMembership({ db: prisma, ...createTestAuth(prisma) }, actor, {
      role: 'STUDENT',
      departmentId: inst.deptA1,
      entryYear: 2025,
    });

    const state = await flow.getVerificationState(prisma, actor);

    expect(state.status).toBe('VERIFIED');
    expect(state.memberships).toEqual([
      expect.objectContaining({
        departmentId: inst.deptA1,
        departmentName: 'Bölüm A1',
        role: 'STUDENT',
        verificationStatus: 'VERIFIED',
      }),
    ]);
  });

  it('başkasının üyelikleri ve belgeleri görünmez', async () => {
    const a = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    const b = await userWithEmail(uniqueAddress(STUDENT_DOMAIN));
    await addMembership(prisma, { userId: b, departmentId: inst.deptA1, role: 'STUDENT' });
    expect((await flow.getVerificationState(prisma, await actorOf(a))).memberships).toEqual([]);
  });
});

describe('requestSignInLink: kayıtlı/kayıtsız e-postaya AYNI yanıt, hız sınırı', () => {
  it('kayıtlı, kayıtsız, askıdaki ve silinmiş adres: aynı dönüş, aynı yan etkiler (1 bağlantı, 1 doğrulama kaydı)', async () => {
    const harness = createTestAuth(prisma);
    const deps = { db: prisma, ...harness };
    const registered = uniqueAddress('ornek.test', 'kayitli');
    await userWithEmail(registered);
    const banned = uniqueAddress('ornek.test', 'askida');
    const bannedId = await userWithEmail(banned);
    await prisma.user.update({ where: { id: bannedId }, data: { banned: true } });
    const deleted = uniqueAddress('ornek.test', 'silinmis');
    const deletedId = await userWithEmail(deleted);
    await prisma.user.update({ where: { id: deletedId }, data: { deletedAt: new Date() } });
    const unknown = uniqueAddress('ornek.test', 'bilinmeyen');

    const outcomes = [];
    for (const address of [registered, banned, deleted, unknown]) {
      const linksBefore = harness.sent.signInLinks.length;
      const verificationsBefore = await prisma.verification.count();
      const result = await flow.requestSignInLink(deps, {
        email: address,
        headers: new Headers(),
        clientIp: null,
      });
      outcomes.push({
        result,
        newLinks: harness.sent.signInLinks.length - linksBefore,
        newVerifications: (await prisma.verification.count()) - verificationsBefore,
        sentTo: harness.sent.signInLinks[linksBefore]?.to,
      });
    }

    for (const [index, address] of [registered, banned, deleted, unknown].entries()) {
      expect(outcomes[index]).toEqual({
        result: CHECK_EMAIL_RESPONSE,
        newLinks: 1,
        newVerifications: 1,
        sentTo: address,
      });
    }
  });

  it('dönüş yolu: güvenli site içi yol bağlantının callbackURL değerine taşınır; yabancı/güvensiz yol varsayılana düşer', async () => {
    const harness = createTestAuth(prisma);
    const deps = { db: prisma, ...harness };
    const cases: [string | undefined, string][] = [
      ['/hesap/gizlilik?sekme=1', '/hesap/gizlilik?sekme=1'],
      [undefined, '/'],
      ['https://kotu.example/ele-gecir', '/'],
      ['//kotu.example', '/'],
      ['/\\kotu.example', '/'],
      ['/%2f%2fkotu.example', '/'],
      ['/%255ckotu.example', '/'],
      ['/%252f%252fkotu.example', '/'],
      ['/%256fnay', '/'],
      ['javascript:alert(1)', '/'],
      ['/giris', '/'],
    ];
    for (const [returnTo, expected] of cases) {
      const before = harness.sent.signInLinks.length;
      await flow.requestSignInLink(deps, {
        email: uniqueAddress('ornek.test', 'donus'),
        headers: new Headers(),
        clientIp: null,
        returnTo,
      });
      const url = new URL(harness.sent.signInLinks[before]?.url ?? '');
      expect(url.searchParams.get('callbackURL')).toBe(expected);
    }
  });

  it('e-posta kuyruğu çökse bile yanıt aynıdır (hata yutulur); hiçbir kod kayıt durumunu ele vermez', async () => {
    const harness = createTestAuth(prisma);
    harness.fail.all = true;
    const result = await flow.requestSignInLink(
      { db: prisma, ...harness },
      { email: uniqueAddress('ornek.test'), headers: new Headers(), clientIp: null },
    );
    expect(result).toEqual(CHECK_EMAIL_RESPONSE);
  });

  it('aynı adres saatte 5 kez bağlantı alır, 6.sı RATE_LIMITED; başka adres etkilenmez; sayaç anahtarında ham e-posta yok', async () => {
    const harness = createTestAuth(prisma);
    const deps = { db: prisma, ...harness, now: () => NOW };
    const address = uniqueAddress('ornek.test', 'bombardiman');
    const request = (email: string) =>
      flow.requestSignInLink(deps, { email, headers: new Headers(), clientIp: null });

    for (let i = 0; i < 5; i += 1) await request(address);
    const error = await request(address).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(isCodedError(error) && error.code).toBe('RATE_LIMITED');
    expect(isCodedError(error) && typeof error.params.retryAfterSeconds).toBe('number');
    expect(harness.sent.signInLinks.filter((l) => l.to === address)).toHaveLength(5);
    await expect(request(uniqueAddress('ornek.test'))).resolves.toEqual(CHECK_EMAIL_RESPONSE);
    const keys = await prisma.rateLimit.findMany({
      where: { key: { startsWith: 'app:magic-link:email:' } },
      select: { key: true },
    });
    expect(keys.every((k) => !k.key.includes('@') && !k.key.includes('bombardiman'))).toBe(true);
  });

  it('istemci adresi başına saatte 20 istek (adres bilinirse); adres yoksa yalnız e-posta sınırı işler', async () => {
    const harness = createTestAuth(prisma);
    const deps = { db: prisma, ...harness, now: () => NOW };
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    let rejectedAt = -1;
    for (let i = 0; i < 25; i += 1) {
      try {
        await flow.requestSignInLink(deps, {
          email: uniqueAddress('ornek.test'),
          headers: new Headers(),
          clientIp: ip,
        });
      } catch (error) {
        if (isCodedError(error) && error.code === 'RATE_LIMITED') {
          rejectedAt = i;
          break;
        }
        throw error;
      }
    }
    expect(rejectedAt).toBe(20);
  });
});

describe('LinkedIn ile giriş', () => {
  it('anahtar yoksa seçenek kapalı + sebep; başlatma AUTH_PROVIDER_NOT_CONFIGURED', async () => {
    const harness = createTestAuth(prisma);
    expect(flow.getSignInOptions(harness.env)).toEqual({
      linkedin: { enabled: false, disabledReason: 'AUTH_PROVIDER_NOT_CONFIGURED' },
    });
    expect(
      await codeOf(
        flow.startLinkedInSignIn(
          { db: prisma, ...harness },
          { headers: new Headers(), clientIp: null },
        ),
      ),
    ).toBe('AUTH_PROVIDER_NOT_CONFIGURED');
  });

  it('anahtar varsa seçenek açık; başlatma LinkedIn yetkilendirme adresini (state ile) döner', async () => {
    const env = testAuthEnv({
      LINKEDIN_CLIENT_ID: 'istemci-kimligi',
      LINKEDIN_CLIENT_SECRET: 'istemci-sirri',
    });
    const harness = createTestAuth(prisma, env);
    expect(flow.getSignInOptions(env)).toEqual({
      linkedin: { enabled: true, disabledReason: null },
    });

    const { redirectUrl } = await flow.startLinkedInSignIn(
      { db: prisma, ...harness },
      { headers: new Headers(), clientIp: null },
    );

    const url = new URL(redirectUrl);
    expect(url.hostname).toMatch(/linkedin\.com$/);
    expect(url.searchParams.get('client_id')).toBe('istemci-kimligi');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('redirect_uri')).toBe(`${env.APP_URL}/api/auth/callback/linkedin`);
    expect(redirectUrl).not.toContain('istemci-sirri');
  });

  it('sağlayıcıdan gelen jetonlar veritabanına yazılmaz (yalnız kimlik kanıtı)', async () => {
    const env = testAuthEnv({ LINKEDIN_CLIENT_ID: 'a', LINKEDIN_CLIENT_SECRET: 'b' });
    const { auth } = createTestAuth(prisma, env);
    const userId = await createUser(prisma);
    const context = await auth.$context;

    await context.internalAdapter.linkAccount({
      userId,
      providerId: 'linkedin',
      accountId: unique('li'),
      accessToken: 'gizli-erisim',
      refreshToken: 'gizli-yenileme',
      idToken: 'gizli-kimlik',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000),
      scope: 'openid,profile,email',
    });

    const account = await prisma.account.findFirstOrThrow({ where: { userId } });
    expect(account).toMatchObject({
      providerId: 'linkedin',
      scope: 'openid,profile,email',
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
    });
  });
});

describe('e-posta değiştirme (iki adımlı: eski adres onaylar, yeni adres doğrular)', () => {
  it('eski adrese onay, onaydan sonra yeni adrese doğrulama; doğrulayınca e-posta değişir ve oturum sürer', async () => {
    const harness = createTestAuth(prisma);
    const deps = { db: prisma, ...harness, now: () => NOW };
    const oldAddress = uniqueAddress('ornek.test', 'eski');
    const newAddress = uniqueAddress('ornek.test', 'yeni');
    const { headers } = await signInWithMagicLink(harness.auth, harness.sent, oldAddress);
    const userId = (await harness.auth.api.getSession({ headers }))?.user.id ?? '';
    const actor = await actorOf(userId);

    const result = await flow.requestEmailChange(deps, actor, { newEmail: newAddress, headers });
    expect(result).toEqual(CHECK_EMAIL_RESPONSE);
    expect(harness.sent.changeConfirmations).toHaveLength(1);
    expect(harness.sent.changeConfirmations[0]).toMatchObject({
      to: oldAddress,
      newEmail: newAddress,
      userId,
    });
    expect(harness.sent.changeVerifications).toHaveLength(0); // yeni adrese henüz gitmedi
    // İki bağlantı ayrı ekrana döner (sabit site içi yollar).
    expect(
      new URL(harness.sent.changeConfirmations[0]?.url ?? '').searchParams.get('callbackURL'),
    ).toBe(EMAIL_CHANGE_RETURN_PATHS.oldAddressConfirmed);

    // 1. adım: eski adresteki bağlantıya tıkla → yeni adrese doğrulama gider
    const confirmToken =
      new URL(harness.sent.changeConfirmations[0]?.url ?? '').searchParams.get('token') ?? '';
    await harness.auth.api.verifyEmail({
      query: { token: confirmToken, callbackURL: '/' },
      headers,
      asResponse: true,
    });
    expect(harness.sent.changeVerifications).toHaveLength(1);
    expect(harness.sent.changeVerifications[0]).toMatchObject({ to: newAddress, userId });
    expect(
      new URL(harness.sent.changeVerifications[0]?.url ?? '').searchParams.get('callbackURL'),
    ).toBe(EMAIL_CHANGE_RETURN_PATHS.completed);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email).toBe(oldAddress);

    // 2. adım: yeni adresteki bağlantıya tıkla → e-posta değişir
    const verifyToken =
      new URL(harness.sent.changeVerifications[0]?.url ?? '').searchParams.get('token') ?? '';
    await harness.auth.api.verifyEmail({
      query: { token: verifyToken, callbackURL: '/' },
      headers,
      asResponse: true,
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ email: newAddress, emailVerified: true });
    expect((await harness.auth.api.getSession({ headers }))?.user.id).toBe(userId);
  });

  it('yeni adres başkasına aitse CHECK_EMAIL (sızıntı yok); kendi mevcut adresi EMAIL_CHANGE_SAME_ADDRESS; hiçbir e-posta gitmez', async () => {
    const harness = createTestAuth(prisma);
    const deps = { db: prisma, ...harness, now: () => NOW };
    const mine = uniqueAddress('ornek.test', 'benim');
    const taken = uniqueAddress('ornek.test', 'dolu');
    await userWithEmail(taken);
    const { headers } = await signInWithMagicLink(harness.auth, harness.sent, mine);
    const actor = await actorOf((await harness.auth.api.getSession({ headers }))?.user.id ?? '');

    await expect(
      flow.requestEmailChange(deps, actor, { newEmail: taken, headers }),
    ).resolves.toEqual(CHECK_EMAIL_RESPONSE);
    expect(await codeOf(flow.requestEmailChange(deps, actor, { newEmail: mine, headers }))).toBe(
      'EMAIL_CHANGE_SAME_ADDRESS',
    );
    expect(
      await codeOf(
        flow.requestEmailChange(deps, actor, { newEmail: `  ${mine.toUpperCase()} `, headers }),
      ),
    ).toBe('EMAIL_CHANGE_SAME_ADDRESS');
    expect(harness.sent.changeConfirmations).toHaveLength(0);
    expect(harness.sent.changeVerifications).toHaveLength(0);
  });

  it('kullanıcı başına saatte 3 istek; 4.sü RATE_LIMITED', async () => {
    const harness = createTestAuth(prisma);
    const deps = { db: prisma, ...harness, now: () => NOW };
    const { headers } = await signInWithMagicLink(
      harness.auth,
      harness.sent,
      uniqueAddress('ornek.test'),
    );
    const actor = await actorOf((await harness.auth.api.getSession({ headers }))?.user.id ?? '');
    for (let i = 0; i < 3; i += 1)
      await flow.requestEmailChange(deps, actor, {
        newEmail: uniqueAddress('ornek.test'),
        headers,
      });
    expect(
      await codeOf(
        flow.requestEmailChange(deps, actor, { newEmail: uniqueAddress('ornek.test'), headers }),
      ),
    ).toBe('RATE_LIMITED');
  });
});
