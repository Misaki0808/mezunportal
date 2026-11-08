import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';
import { isCodedError } from '@/lib/errors';
import { createTestAuth, signInWithMagicLink, uniqueAddress } from '@/test/auth';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
  type Institution,
} from '@/test/fixtures';

import { createPermissions } from '../permissions/guards';
import { mapAuthResponse } from '../auth/responses';
import {
  correctMembership,
  grantAdmin,
  revokeAdmin,
  suspendUser,
  unsuspendUser,
} from './admin-users';

const db = createTestPrisma();
const deps = { db };
afterAll(() => db.$disconnect());

let inst: Institution;
const admins: Record<'deptA1' | 'deptA2' | 'deptB1' | 'facultyA' | 'system' | 'system2', string> =
  {} as never;

async function adminOf(
  scope:
    | { kind: 'DEPARTMENT'; departmentId: string }
    | { kind: 'FACULTY'; facultyId: string }
    | { kind: 'SYSTEM' },
  departmentId: string,
) {
  const userId = await createUser(db);
  await addMembership(db, { userId, departmentId, role: 'ACADEMIC' });
  await addGrant(db, {
    userId,
    scope: scope.kind,
    ...(scope.kind === 'DEPARTMENT' ? { departmentId: scope.departmentId } : {}),
    ...(scope.kind === 'FACULTY' ? { facultyId: scope.facultyId } : {}),
  });
  await grantRequiredConsents(db, userId);
  return userId;
}

beforeAll(async () => {
  inst = await createInstitution(db);
  admins.deptA1 = await adminOf({ kind: 'DEPARTMENT', departmentId: inst.deptA1 }, inst.deptA1);
  admins.deptA2 = await adminOf({ kind: 'DEPARTMENT', departmentId: inst.deptA2 }, inst.deptA2);
  admins.deptB1 = await adminOf({ kind: 'DEPARTMENT', departmentId: inst.deptB1 }, inst.deptB1);
  admins.facultyA = await adminOf({ kind: 'FACULTY', facultyId: inst.facultyA }, inst.deptA1);
  admins.system = await adminOf({ kind: 'SYSTEM' }, inst.deptA1);
  admins.system2 = await adminOf({ kind: 'SYSTEM' }, inst.deptA1);
});

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(isCodedError(error), `kodlu hata bekleniyordu (${code}), gelen: ${String(error)}`).toBe(
    true,
  );
  expect(isCodedError(error) && error.code).toBe(code);
  return error;
}

/** Öğrenci üye + iki açık oturum. */
async function student(departmentId: string, options: { sessions?: number } = {}) {
  const userId = await createUser(db);
  const membershipId = await addMembership(db, {
    userId,
    departmentId,
    role: 'STUDENT',
    entryYear: 2024,
  });
  for (let index = 0; index < (options.sessions ?? 2); index += 1) {
    await db.session.create({
      data: { userId, token: randomUUID(), expiresAt: new Date(Date.now() + 86_400_000) },
    });
  }
  return { userId, membershipId };
}

const auditRows = (targetId: string) =>
  db.adminAuditLog.findMany({ where: { targetId }, orderBy: { createdAt: 'asc' } });
const userRow = (id: string) => db.user.findUniqueOrThrow({ where: { id } });
const REASON = 'Topluluk kurallarına aykırı davranış';

// =============================================================================================
// Askıya alma
// =============================================================================================
describe('suspendUser', () => {
  it('bölüm yöneticisi kendi bölümündeki kullanıcıyı askıya alır: ban alanları, oturumlar silinir, işlem kaydı yazılır', async () => {
    const target = await student(inst.deptA1, { sessions: 3 });
    const result = await suspendUser(deps, admins.deptA1, {
      userId: target.userId,
      reason: REASON,
    });
    expect(result).toEqual({
      userId: target.userId,
      status: 'SUSPENDED',
      expiresAt: null,
      sessionsRevoked: 3,
    });
    expect(await userRow(target.userId)).toMatchObject({
      banned: true,
      banReason: REASON,
      banExpires: null,
    });
    expect(await db.session.count({ where: { userId: target.userId } })).toBe(0);
    const [entry, ...rest] = await auditRows(target.userId);
    expect(rest).toEqual([]);
    expect(entry).toMatchObject({
      actorId: admins.deptA1,
      action: 'USER_SUSPEND',
      targetType: 'USER',
      reason: REASON,
      metadata: { userId: target.userId, indefinite: true, expiresAt: null, sessionsRevoked: 3 },
    });
  });

  it('süreli askı: bitiş yazılır; süre dolunca hesap yeniden etkin sayılır ve yeniden askıya alınabilir', async () => {
    const target = await student(inst.deptA1);
    const start = new Date('2030-01-01T10:00:00Z');
    const expiresAt = new Date(start.getTime() + 7 * 86_400_000);
    await suspendUser({ db, now: () => start }, admins.deptA1, {
      userId: target.userId,
      reason: REASON,
      expiresAt,
    });
    expect((await userRow(target.userId)).banExpires).toEqual(expiresAt);
    await expectCode(
      suspendUser({ db, now: () => new Date(start.getTime() + 86_400_000) }, admins.deptA1, {
        userId: target.userId,
        reason: REASON,
      }),
      'USER_ALREADY_SUSPENDED',
    );
    const after = new Date(expiresAt.getTime() + 1000);
    await suspendUser({ db, now: () => after }, admins.deptA1, {
      userId: target.userId,
      reason: REASON,
    });
    expect((await userRow(target.userId)).banExpires).toBeNull();
  });

  it('geçersiz süre (geçmiş, 365 günden uzun) VALIDATION_INVALID; hiçbir şey yazılmaz', async () => {
    const target = await student(inst.deptA1);
    for (const days of [-1, 366, 4000]) {
      await expectCode(
        suspendUser(deps, admins.deptA1, {
          userId: target.userId,
          reason: REASON,
          expiresAt: new Date(Date.now() + days * 86_400_000),
        }),
        'VALIDATION_INVALID',
      );
    }
    expect((await userRow(target.userId)).banned).toBe(false);
    expect(await auditRows(target.userId)).toEqual([]);
  });

  it('gerekçe zorunlu ve kişisel veri içeremez; hiçbir şey yazılmaz', async () => {
    const target = await student(inst.deptA1);
    await expectCode(
      suspendUser(deps, admins.deptA1, { userId: target.userId, reason: '' }),
      'AUDIT_REASON_REQUIRED',
    );
    await expectCode(
      suspendUser(deps, admins.deptA1, { userId: target.userId, reason: 'ab' }),
      'AUDIT_REASON_INVALID',
    );
    await expectCode(
      suspendUser(deps, admins.deptA1, {
        userId: target.userId,
        reason: 'Mail attı: kisi@ornek.com ile iletişim',
      }),
      'AUDIT_REASON_INVALID',
    );
    expect((await userRow(target.userId)).banned).toBe(false);
    expect(await db.session.count({ where: { userId: target.userId } })).toBe(2);
    expect(await auditRows(target.userId)).toEqual([]);
  });

  describe('kapsam: yönetici yalnız kendi kapsamındaki kullanıcıyı yönetir', () => {
    it('başka bölümün kullanıcısı AUTH_FORBIDDEN; kullanıcı etkilenmez, iz bırakılmaz', async () => {
      const target = await student(inst.deptA2);
      await expectCode(
        suspendUser(deps, admins.deptA1, { userId: target.userId, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      expect((await userRow(target.userId)).banned).toBe(false);
      expect(await db.session.count({ where: { userId: target.userId } })).toBe(2);
      expect(await auditRows(target.userId)).toEqual([]);
    });

    it.each([
      ['fakülte yöneticisi, fakültesindeki iki bölüm', 'facultyA', ['deptA1', 'deptA2'], 'OK'],
      ['fakülte yöneticisi, başka fakülte', 'facultyA', ['deptB1'], 'AUTH_FORBIDDEN'],
      ['bölüm yöneticisi B1, A1 kullanıcısı', 'deptB1', ['deptA1'], 'AUTH_FORBIDDEN'],
      ['sistem yöneticisi, her yer', 'system', ['deptA1', 'deptB1'], 'OK'],
    ] as const)('%s', async (_name, adminKey, depts, expected) => {
      const deptId = { deptA1: inst.deptA1, deptA2: inst.deptA2, deptB1: inst.deptB1 };
      for (const dept of depts) {
        const target = await student(deptId[dept]);
        const run = suspendUser(deps, admins[adminKey], { userId: target.userId, reason: REASON });
        if (expected === 'OK') await expect(run).resolves.toMatchObject({ status: 'SUSPENDED' });
        else await expectCode(run, expected);
      }
    });

    it('hesap geneli işlem: bir üyeliği kapsam dışı olan kullanıcıyı yalnız kapsamı genişleten yönetici askıya alır', async () => {
      const userId = await createUser(db);
      await addMembership(db, {
        userId,
        departmentId: inst.deptA1,
        role: 'STUDENT',
        entryYear: 2024,
      });
      await addMembership(db, {
        userId,
        departmentId: inst.deptB1,
        role: 'ALUMNI',
        graduationYear: 2022,
      });
      await expectCode(
        suspendUser(deps, admins.deptA1, { userId, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      await expectCode(
        suspendUser(deps, admins.facultyA, { userId, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      expect((await userRow(userId)).banned).toBe(false);
      await expect(
        suspendUser(deps, admins.system, { userId, reason: REASON }),
      ).resolves.toBeDefined();
    });

    it('kapanmış üyelik kapsamı genişletmez: yalnız ETKİN üyelikler sayılır', async () => {
      const userId = await createUser(db);
      await addMembership(db, {
        userId,
        departmentId: inst.deptA1,
        role: 'STUDENT',
        entryYear: 2024,
      });
      await addMembership(db, {
        userId,
        departmentId: inst.deptB1,
        role: 'STUDENT',
        entryYear: 2020,
        endedAt: new Date('2024-01-01'),
      });
      await expect(
        suspendUser(deps, admins.deptA1, { userId, reason: REASON }),
      ).resolves.toBeDefined();
    });

    it('hiç üyeliği olmayan kullanıcıyı yalnız sistem yöneticisi yönetir', async () => {
      const userId = await createUser(db);
      await expectCode(
        suspendUser(deps, admins.deptA1, { userId, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      await expectCode(
        suspendUser(deps, admins.facultyA, { userId, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      await expect(
        suspendUser(deps, admins.system, { userId, reason: REASON }),
      ).resolves.toBeDefined();
    });

    it('var olmayan kullanıcı: sistem dışı yöneticide AUTH_FORBIDDEN (varlık sızmaz), sistem yöneticisinde RESOURCE_NOT_FOUND', async () => {
      const missing = randomUUID();
      await expectCode(
        suspendUser(deps, admins.deptA1, { userId: missing, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      await expectCode(
        suspendUser(deps, admins.system, { userId: missing, reason: REASON }),
        'RESOURCE_NOT_FOUND',
      );
    });

    it('silinmiş hesap yönetilemez', async () => {
      const userId = await createUser(db, { deletedAt: new Date() });
      await addMembership(db, {
        userId,
        departmentId: inst.deptA1,
        role: 'STUDENT',
        entryYear: 2024,
      });
      await expectCode(
        suspendUser(deps, admins.deptA1, { userId, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      await expectCode(
        suspendUser(deps, admins.system, { userId, reason: REASON }),
        'RESOURCE_NOT_FOUND',
      );
    });
  });

  describe('kendi üzerinde ve yetkili kullanıcı üzerinde işlem', () => {
    it('kimse kendini askıya alamaz (sistem yöneticisi dahil)', async () => {
      for (const key of ['deptA1', 'facultyA', 'system'] as const) {
        await expectCode(
          suspendUser(deps, admins[key], { userId: admins[key], reason: REASON }),
          'ADMIN_SELF_ACTION',
        );
        expect((await userRow(admins[key])).banned).toBe(false);
      }
    });

    it('yönetici yetkisi olan kullanıcıyı yalnız sistem yöneticisi askıya alır', async () => {
      const peer = await adminOf({ kind: 'DEPARTMENT', departmentId: inst.deptA1 }, inst.deptA1);
      await expectCode(
        suspendUser(deps, admins.deptA1, { userId: peer, reason: REASON }),
        'ADMIN_TARGET_PRIVILEGED',
      );
      await expectCode(
        suspendUser(deps, admins.facultyA, { userId: peer, reason: REASON }),
        'ADMIN_TARGET_PRIVILEGED',
      );
      // Kapsam dışı yetkili: önce kapsam, varlık sızmaz.
      await expectCode(
        suspendUser(deps, admins.deptB1, { userId: peer, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      expect((await userRow(peer)).banned).toBe(false);
      await expect(
        suspendUser(deps, admins.system, { userId: peer, reason: REASON }),
      ).resolves.toBeDefined();
    });

    it('kaldırılmış yetki hedefi yetkili saymaz', async () => {
      const userId = await createUser(db);
      await addMembership(db, { userId, departmentId: inst.deptA1, role: 'ACADEMIC' });
      await addGrant(db, { userId, scope: 'DEPARTMENT', departmentId: inst.deptA1, revoked: true });
      await expect(
        suspendUser(deps, admins.deptA1, { userId, reason: REASON }),
      ).resolves.toBeDefined();
    });
  });

  describe('yönetici olmayanlar ve yetkisini yitirenler', () => {
    async function persona(kind: string): Promise<string> {
      const userId = await createUser(
        db,
        kind === 'suspended'
          ? { banned: true }
          : kind === 'deleted'
            ? { deletedAt: new Date() }
            : {},
      );
      if (kind === 'noMembership') return userId;
      const status = kind === 'unverified' ? 'PENDING' : 'VERIFIED';
      await addMembership(db, {
        userId,
        departmentId: inst.deptA1,
        role: kind === 'student' ? 'STUDENT' : 'ACADEMIC',
        status,
        entryYear: kind === 'student' ? 2024 : undefined,
      });
      if (['student'].includes(kind)) return userId;
      await addGrant(db, {
        userId,
        scope: kind === 'adminOnlyGrant' ? 'SYSTEM' : 'DEPARTMENT',
        departmentId: kind === 'adminOnlyGrant' ? undefined : inst.deptA1,
        revoked: kind === 'revoked',
      });
      return userId;
    }

    it.each([
      ['student', 'AUTH_FORBIDDEN'],
      ['noMembership', 'AUTH_FORBIDDEN'],
      ['revoked', 'AUTH_FORBIDDEN'],
      ['unverified', 'AUTH_NOT_VERIFIED'],
      ['suspended', 'AUTH_ACCOUNT_SUSPENDED'],
      ['deleted', 'AUTH_UNAUTHENTICATED'],
    ] as const)('%s → %s', async (kind, code) => {
      const actorId = await persona(kind);
      const target = await student(inst.deptA1);
      await expectCode(suspendUser(deps, actorId, { userId: target.userId, reason: REASON }), code);
      expect((await userRow(target.userId)).banned).toBe(false);
    });

    it('yetkisi sonradan kaldırılan yönetici, bayat oturumla bile işlem yapamaz (yetki işlemde yeniden yüklenir)', async () => {
      const admin = await adminOf({ kind: 'DEPARTMENT', departmentId: inst.deptA1 }, inst.deptA1);
      const target = await student(inst.deptA1);
      await db.adminGrant.updateMany({
        where: { userId: admin },
        data: { revokedAt: new Date(), revokedById: admin },
      });
      await expectCode(
        suspendUser(deps, admin, { userId: target.userId, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
      expect((await userRow(target.userId)).banned).toBe(false);
    });
  });

  describe('atomiklik ve eşzamanlılık', () => {
    it('işlem kaydı yazılamazsa askıya alma ve oturum silme GERİ ALINIR', async () => {
      const target = await student(inst.deptA1);
      const failing = {
        ...db,
        $transaction: ((fn: (tx: unknown) => Promise<unknown>, options?: unknown) =>
          db.$transaction(
            (tx) =>
              fn(
                new Proxy(tx, {
                  get: (object, property, receiver) =>
                    property === 'adminAuditLog'
                      ? {
                          create: async () => {
                            throw new Error('işlem kaydı kapalı');
                          },
                        }
                      : Reflect.get(object, property, receiver),
                }),
              ),
            options as never,
          )) as never,
      } as unknown as PrismaClient;
      await expect(
        suspendUser({ db: failing }, admins.deptA1, { userId: target.userId, reason: REASON }),
      ).rejects.toThrow('işlem kaydı kapalı');
      expect((await userRow(target.userId)).banned).toBe(false);
      expect(await db.session.count({ where: { userId: target.userId } })).toBe(2);
    });

    it('eşzamanlı iki askıya alma: biri başarılı, diğeri USER_ALREADY_SUSPENDED; tek işlem kaydı', async () => {
      const target = await student(inst.deptA1);
      const outcomes = await Promise.allSettled([
        suspendUser(deps, admins.deptA1, { userId: target.userId, reason: REASON }),
        suspendUser(deps, admins.facultyA, { userId: target.userId, reason: REASON }),
        suspendUser(deps, admins.system, { userId: target.userId, reason: REASON }),
      ]);
      expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          expect(isCodedError(outcome.reason) && outcome.reason.code).toBe(
            'USER_ALREADY_SUSPENDED',
          );
        }
      }
      expect(await auditRows(target.userId)).toHaveLength(1);
    });
  });
});

// =============================================================================================
// Askıyı kaldırma
// =============================================================================================
describe('unsuspendUser', () => {
  it('askıyı kaldırır, ban alanlarını temizler, işlem kaydı yazar; gerekçe zorunlu', async () => {
    const target = await student(inst.deptA1);
    await suspendUser(deps, admins.deptA1, { userId: target.userId, reason: REASON });
    expect(
      await unsuspendUser(deps, admins.deptA1, {
        reason: 'İnceleme tamamlandı',
        userId: target.userId,
      }),
    ).toEqual({
      userId: target.userId,
      status: 'ACTIVE',
    });
    expect(await userRow(target.userId)).toMatchObject({
      banned: false,
      banReason: null,
      banExpires: null,
    });
    expect((await auditRows(target.userId)).map((row) => row.action)).toEqual([
      'USER_SUSPEND',
      'USER_UNSUSPEND',
    ]);
  });

  it('askıda olmayan kullanıcı USER_NOT_SUSPENDED; verilen gerekçede kişisel veri reddedilir', async () => {
    const target = await student(inst.deptA1);
    await expectCode(
      unsuspendUser(deps, admins.deptA1, { reason: 'İnceleme tamamlandı', userId: target.userId }),
      'USER_NOT_SUSPENDED',
    );
    await suspendUser(deps, admins.deptA1, { userId: target.userId, reason: REASON });
    await expectCode(
      unsuspendUser(deps, admins.deptA1, {
        userId: target.userId,
        reason: 'şunu aradı: 05321234567',
      }),
      'AUDIT_REASON_INVALID',
    );
    expect((await userRow(target.userId)).banned).toBe(true);
  });

  it('aynı kapsam kuralları: başka bölüm yöneticisi, kendi hesabı ve yetkili kullanıcı', async () => {
    const target = await student(inst.deptA2);
    await suspendUser(deps, admins.facultyA, { userId: target.userId, reason: REASON });
    await expectCode(
      unsuspendUser(deps, admins.deptA1, { reason: 'İnceleme tamamlandı', userId: target.userId }),
      'AUTH_FORBIDDEN',
    );
    expect((await userRow(target.userId)).banned).toBe(true);
    await expectCode(
      unsuspendUser(deps, admins.deptA2, { reason: 'İnceleme tamamlandı', userId: admins.deptA2 }),
      'ADMIN_SELF_ACTION',
    );
  });

  it('süresi dolmuş askı zaten kalkmış sayılır (USER_NOT_SUSPENDED)', async () => {
    const target = await student(inst.deptA1);
    const start = new Date('2030-03-01T00:00:00Z');
    await suspendUser({ db, now: () => start }, admins.deptA1, {
      userId: target.userId,
      reason: REASON,
      expiresAt: new Date(start.getTime() + 86_400_000),
    });
    await expectCode(
      unsuspendUser({ db, now: () => new Date(start.getTime() + 2 * 86_400_000) }, admins.deptA1, {
        reason: 'İnceleme tamamlandı',
        userId: target.userId,
      }),
      'USER_NOT_SUSPENDED',
    );
  });
});

// =============================================================================================
// Gerçek Better Auth: askıya alınanın oturumu düşer ve giriş yapamaz
// =============================================================================================
describe('askı ve gerçek oturum (Better Auth)', () => {
  it('oturum açık kullanıcı askıya alınınca çerezi hemen geçersizdir, bağlantıyla giriş yapamaz; kaldırılınca girer', async () => {
    const { auth, sent } = createTestAuth(db);
    const address = uniqueAddress('ornek.test');
    const { headers } = await signInWithMagicLink(auth, sent, address);
    const userId = (await auth.api.getSession({ headers }))?.user.id ?? '';
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    expect(await auth.api.getSession({ headers })).not.toBeNull();

    await suspendUser(deps, admins.deptA1, { userId, reason: REASON });

    // 1) Açık çerez: oturum satırı silindi.
    expect(await auth.api.getSession({ headers })).toBeNull();
    expect(await db.session.count({ where: { userId } })).toBe(0);
    // 2) Yetki katmanı (oturum olsa bile) askıdakine hiçbir şey açmaz.
    const permissions = createPermissions({
      db: () => db,
      getSessionUserId: async () => userId,
      now: () => new Date(),
    });
    await expectCode(permissions.requireUser(), 'AUTH_ACCOUNT_SUSPENDED');
    // 3) Yeni giriş: bağlantıya tıklasa da oturum AÇILMAZ.
    await auth.api.signInMagicLink({
      body: { email: address, callbackURL: '/', errorCallbackURL: '/giris' },
      headers: new Headers(),
    });
    const link = sent.signInLinks[sent.signInLinks.length - 1]!;
    const response = await auth.api.magicLinkVerify({
      query: {
        token: new URL(link.url).searchParams.get('token') ?? '',
        callbackURL: '/',
        errorCallbackURL: '/giris',
      },
      headers: new Headers(),
      asResponse: true,
    });
    const mapped = await mapAuthResponse(response, '/api/auth/magic-link/verify');
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(mapped.headers.get('location')).toBe('/giris?hata=AUTH_ACCOUNT_SUSPENDED');
    expect(await db.session.count({ where: { userId } })).toBe(0);

    // 4) Askı kalkınca yeniden girer.
    await unsuspendUser(deps, admins.deptA1, { reason: 'İnceleme tamamlandı', userId });
    const again = await signInWithMagicLink(auth, sent, address);
    expect((await auth.api.getSession({ headers: again.headers }))?.user.id).toBe(userId);
  });
});

// =============================================================================================
// Üyelik düzeltme
// =============================================================================================
describe('correctMembership', () => {
  const REASON_FIX = 'Öğrenci bölümünü yanlış beyan etmiş';

  it('bölüm düzeltme: eski üyelik kapanır, yönetici doğrulamalı yeni üyelik açılır; içerik kullanıcıda kalır; işlem kaydı yazılır', async () => {
    const target = await student(inst.deptA1);
    await db.membership.update({ where: { id: target.membershipId }, data: { classOffset: 2 } });
    const result = await correctMembership(deps, admins.facultyA, {
      membershipId: target.membershipId,
      reason: REASON_FIX,
      changes: { departmentId: inst.deptA2 },
    });
    expect(result.previousMembershipId).toBe(target.membershipId);
    expect(result.membershipId).not.toBe(target.membershipId);

    const old = await db.membership.findUniqueOrThrow({ where: { id: target.membershipId } });
    expect(old.endedAt).toBeInstanceOf(Date);
    const fresh = await db.membership.findUniqueOrThrow({ where: { id: result.membershipId } });
    expect(fresh).toMatchObject({
      userId: target.userId,
      departmentId: inst.deptA2,
      role: 'STUDENT',
      entryYear: 2024,
      classOffset: 2,
      verificationStatus: 'VERIFIED',
      verificationMethod: 'ADMIN',
      verifiedById: admins.facultyA,
      endedAt: null,
    });
    const [entry] = await auditRows(result.membershipId);
    expect(entry).toMatchObject({
      actorId: admins.facultyA,
      action: 'ROLE_CORRECT',
      targetType: 'MEMBERSHIP',
      reason: REASON_FIX,
      metadata: {
        userId: target.userId,
        previousMembershipId: target.membershipId,
        fromDepartmentId: inst.deptA1,
        toDepartmentId: inst.deptA2,
        fromRole: 'STUDENT',
        toRole: 'STUDENT',
        mode: 'REPLACE',
      },
    });
  });

  it('rol düzeltme: öğrenci → mezun (mezuniyet yılı şart), düzeltme değeri sıfırlanır', async () => {
    const target = await student(inst.deptA1);
    await db.membership.update({ where: { id: target.membershipId }, data: { classOffset: 2 } });
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: target.membershipId,
        reason: REASON_FIX,
        changes: { role: 'ALUMNI' },
      }),
      'MEMBERSHIP_CORRECTION_INVALID',
    );
    const result = await correctMembership(deps, admins.deptA1, {
      membershipId: target.membershipId,
      reason: REASON_FIX,
      changes: { role: 'ALUMNI', graduationYear: 2025 },
    });
    expect(
      await db.membership.findUniqueOrThrow({ where: { id: result.membershipId } }),
    ).toMatchObject({
      role: 'ALUMNI',
      graduationYear: 2025,
      classOffset: 0,
      verificationMethod: 'ADMIN',
    });
  });

  it('yalnız yıl değişirse satır yerinde güncellenir (yeni satır yok)', async () => {
    const target = await student(inst.deptA1);
    const result = await correctMembership(deps, admins.deptA1, {
      membershipId: target.membershipId,
      reason: REASON_FIX,
      changes: { entryYear: 2023 },
    });
    expect(result).toEqual({ membershipId: target.membershipId, previousMembershipId: null });
    expect(await db.membership.count({ where: { userId: target.userId } })).toBe(1);
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: target.membershipId } })).entryYear,
    ).toBe(2023);
    expect((await auditRows(target.membershipId))[0]?.metadata).toMatchObject({ mode: 'IN_PLACE' });
  });

  it('kapsam: eski ve yeni bölüm yöneticinin kapsamında olmalı; ihlalde hiçbir şey değişmez', async () => {
    const inA1 = await student(inst.deptA1);
    const inB1 = await student(inst.deptB1);
    const before = await db.membership.count();
    // yeni bölüm kapsam dışı
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: inA1.membershipId,
        reason: REASON_FIX,
        changes: { departmentId: inst.deptA2 },
      }),
      'AUTH_FORBIDDEN',
    );
    // eski bölüm kapsam dışı
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: inB1.membershipId,
        reason: REASON_FIX,
        changes: { entryYear: 2022 },
      }),
      'AUTH_FORBIDDEN',
    );
    // var olmayan üyelik
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: randomUUID(),
        reason: REASON_FIX,
        changes: { entryYear: 2022 },
      }),
      'AUTH_FORBIDDEN',
    );
    await expectCode(
      correctMembership(deps, admins.system, {
        membershipId: randomUUID(),
        reason: REASON_FIX,
        changes: { entryYear: 2022 },
      }),
      'RESOURCE_NOT_FOUND',
    );
    expect(await db.membership.count()).toBe(before);
    expect(
      (await db.membership.findUniqueOrThrow({ where: { id: inA1.membershipId } })).endedAt,
    ).toBeNull();
  });

  it('var olmayan hedef bölüm MEMBERSHIP_CORRECTION_INVALID', async () => {
    const target = await student(inst.deptA1);
    await expectCode(
      correctMembership(deps, admins.system, {
        membershipId: target.membershipId,
        reason: REASON_FIX,
        changes: { departmentId: randomUUID() },
      }),
      'MEMBERSHIP_CORRECTION_INVALID',
    );
  });

  it('kendi üyeliğini düzeltemez; yetkili kullanıcının üyeliğini yalnız sistem yöneticisi düzeltir', async () => {
    const own = (await db.membership.findFirstOrThrow({ where: { userId: admins.facultyA } })).id;
    await expectCode(
      correctMembership(deps, admins.facultyA, {
        membershipId: own,
        reason: REASON_FIX,
        changes: { entryYear: 2020 },
      }),
      'ADMIN_SELF_ACTION',
    );
    const peer = await adminOf({ kind: 'DEPARTMENT', departmentId: inst.deptA1 }, inst.deptA1);
    const peerMembership = (await db.membership.findFirstOrThrow({ where: { userId: peer } })).id;
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: peerMembership,
        reason: REASON_FIX,
        changes: { role: 'ALUMNI', graduationYear: 2020 },
      }),
      'ADMIN_TARGET_PRIVILEGED',
    );
    await expect(
      correctMembership(deps, admins.system, {
        membershipId: peerMembership,
        reason: REASON_FIX,
        changes: { role: 'STUDENT', entryYear: 2022 },
      }),
    ).resolves.toBeDefined();
  });

  it('gerekçe zorunlu; bekleyen/reddedilen/kapanmış üyelik ve aynı değerler reddedilir', async () => {
    const target = await student(inst.deptA1);
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: target.membershipId,
        reason: '',
        changes: { entryYear: 2022 },
      }),
      'AUDIT_REASON_REQUIRED',
    );
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: target.membershipId,
        reason: REASON_FIX,
        changes: { entryYear: 2024 },
      }),
      'MEMBERSHIP_CORRECTION_INVALID',
    );
    const pendingUser = await createUser(db);
    const pending = await addMembership(db, {
      userId: pendingUser,
      departmentId: inst.deptA1,
      role: 'ALUMNI',
      status: 'PENDING',
      graduationYear: 2023,
    });
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: pending,
        reason: REASON_FIX,
        changes: { graduationYear: 2022 },
      }),
      'MEMBERSHIP_CORRECTION_INVALID',
    );
    const ended = await student(inst.deptA1);
    await db.membership.update({
      where: { id: ended.membershipId },
      data: { endedAt: new Date() },
    });
    await expectCode(
      correctMembership(deps, admins.deptA1, {
        membershipId: ended.membershipId,
        reason: REASON_FIX,
        changes: { entryYear: 2022 },
      }),
      'MEMBERSHIP_CORRECTION_INVALID',
    );
  });

  it('kullanıcının hedef bölüm+rolde zaten etkin üyeliği varsa çift açılmaz', async () => {
    const userId = await createUser(db);
    const first = await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    await addMembership(db, {
      userId,
      departmentId: inst.deptA2,
      role: 'STUDENT',
      entryYear: 2023,
    });
    await expectCode(
      correctMembership(deps, admins.facultyA, {
        membershipId: first,
        reason: REASON_FIX,
        changes: { departmentId: inst.deptA2 },
      }),
      'MEMBERSHIP_CORRECTION_INVALID',
    );
    expect((await db.membership.findUniqueOrThrow({ where: { id: first } })).endedAt).toBeNull();
  });

  it('eşzamanlı iki düzeltme: biri başarılı, diğeri geçersiz; tek etkin üyelik kalır', async () => {
    const target = await student(inst.deptA1);
    const outcomes = await Promise.allSettled([
      correctMembership(deps, admins.facultyA, {
        membershipId: target.membershipId,
        reason: REASON_FIX,
        changes: { departmentId: inst.deptA2 },
      }),
      correctMembership(deps, admins.system, {
        membershipId: target.membershipId,
        reason: REASON_FIX,
        changes: { role: 'ALUMNI', graduationYear: 2025 },
      }),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(await db.membership.count({ where: { userId: target.userId, endedAt: null } })).toBe(1);
  });
});

// =============================================================================================
// Yönetici atama / kaldırma
// =============================================================================================
describe('grantAdmin / revokeAdmin', () => {
  it('sistem yöneticisi bölüm, fakülte ve sistem yetkisi verir; işlem kaydı yazılır; yetki hemen geçerlidir', async () => {
    const candidate = await student(inst.deptA1);
    const dept = await grantAdmin(deps, admins.system, {
      scope: 'DEPARTMENT',
      userId: candidate.userId,
      departmentId: inst.deptA1,
    });
    const row = await db.adminGrant.findUniqueOrThrow({ where: { id: dept.grantId } });
    expect(row).toMatchObject({
      userId: candidate.userId,
      scope: 'DEPARTMENT',
      departmentId: inst.deptA1,
      facultyId: null,
      grantedById: admins.system,
      revokedAt: null,
    });
    expect((await auditRows(dept.grantId))[0]).toMatchObject({
      actorId: admins.system,
      action: 'ADMIN_GRANT',
      targetType: 'ADMIN_GRANT',
      metadata: {
        userId: candidate.userId,
        scope: 'DEPARTMENT',
        departmentId: inst.deptA1,
        facultyId: null,
      },
    });
    const permissions = createPermissions({
      db: () => db,
      getSessionUserId: async () => candidate.userId,
      now: () => new Date(),
    });
    await expect(
      permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: inst.deptA1 }),
    ).resolves.toBeDefined();
    await expectCode(
      permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: inst.deptA2 }),
      'AUTH_FORBIDDEN',
    );

    await expect(
      grantAdmin(deps, admins.system, {
        scope: 'FACULTY',
        userId: candidate.userId,
        facultyId: inst.facultyA,
      }),
    ).resolves.toBeDefined();
    await expect(
      grantAdmin(deps, admins.system, { scope: 'SYSTEM', userId: candidate.userId }),
    ).resolves.toBeDefined();
  });

  it('aynı kapsamda ikinci etkin yetki ADMIN_GRANT_EXISTS; kaldırıldıktan sonra yeniden verilebilir', async () => {
    const candidate = await student(inst.deptA1);
    const input = { scope: 'FACULTY' as const, userId: candidate.userId, facultyId: inst.facultyB };
    const first = await grantAdmin(deps, admins.system, input);
    await expectCode(grantAdmin(deps, admins.system, input), 'ADMIN_GRANT_EXISTS');
    await revokeAdmin(deps, admins.system, { grantId: first.grantId, reason: 'Görev değişti' });
    await expect(grantAdmin(deps, admins.system, input)).resolves.toBeDefined();
  });

  it('eşzamanlı aynı yetki verme: biri başarılı, diğeri ADMIN_GRANT_EXISTS', async () => {
    const candidate = await student(inst.deptA1);
    const input = {
      scope: 'DEPARTMENT' as const,
      userId: candidate.userId,
      departmentId: inst.deptB1,
    };
    const outcomes = await Promise.allSettled([
      grantAdmin(deps, admins.system, input),
      grantAdmin(deps, admins.system2, input),
      grantAdmin(deps, admins.system, input),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected')
        expect(isCodedError(outcome.reason) && outcome.reason.code).toBe('ADMIN_GRANT_EXISTS');
    }
  });

  it('yalnız sistem yöneticisi atar/kaldırır: bölüm ve fakülte yöneticisi, öğrenci AUTH_FORBIDDEN', async () => {
    const candidate = await student(inst.deptA1);
    const grant = await addGrant(db, {
      userId: candidate.userId,
      scope: 'DEPARTMENT',
      departmentId: inst.deptA1,
    });
    for (const actor of [admins.deptA1, admins.facultyA, (await student(inst.deptA1)).userId]) {
      await expectCode(
        grantAdmin(deps, actor, { scope: 'SYSTEM', userId: candidate.userId }),
        'AUTH_FORBIDDEN',
      );
      await expectCode(
        revokeAdmin(deps, actor, { grantId: grant, reason: REASON }),
        'AUTH_FORBIDDEN',
      );
    }
    expect((await db.adminGrant.findUniqueOrThrow({ where: { id: grant } })).revokedAt).toBeNull();
  });

  it('hedef var olmalı: silinmiş/olmayan kullanıcı, olmayan fakülte/bölüm RESOURCE_NOT_FOUND; kendine atama yasak', async () => {
    const deleted = await createUser(db, { deletedAt: new Date() });
    const real = await student(inst.deptA1);
    await expectCode(
      grantAdmin(deps, admins.system, { scope: 'SYSTEM', userId: deleted }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      grantAdmin(deps, admins.system, { scope: 'SYSTEM', userId: randomUUID() }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      grantAdmin(deps, admins.system, {
        scope: 'FACULTY',
        userId: real.userId,
        facultyId: randomUUID(),
      }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      grantAdmin(deps, admins.system, {
        scope: 'DEPARTMENT',
        userId: real.userId,
        departmentId: randomUUID(),
      }),
      'RESOURCE_NOT_FOUND',
    );
    await expectCode(
      grantAdmin(deps, admins.system, { scope: 'SYSTEM', userId: admins.system }),
      'ADMIN_SELF_ACTION',
    );
  });

  it('kaldırma: gerekçe zorunlu; yetki kapanır ve kullanıcı artık yönetemez; işlem kaydı yazılır', async () => {
    const candidate = await student(inst.deptA1);
    const grant = await grantAdmin(deps, admins.system, {
      scope: 'DEPARTMENT',
      userId: candidate.userId,
      departmentId: inst.deptA1,
    });
    await expectCode(
      revokeAdmin(deps, admins.system, { grantId: grant.grantId, reason: '' }),
      'AUDIT_REASON_REQUIRED',
    );
    await expectCode(
      revokeAdmin(deps, admins.system, { grantId: grant.grantId, reason: 'ab' }),
      'AUDIT_REASON_INVALID',
    );
    expect(
      (await db.adminGrant.findUniqueOrThrow({ where: { id: grant.grantId } })).revokedAt,
    ).toBeNull();

    const permissions = createPermissions({
      db: () => db,
      getSessionUserId: async () => candidate.userId,
      now: () => new Date(),
    });
    await expect(
      permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: inst.deptA1 }),
    ).resolves.toBeDefined();
    const result = await revokeAdmin(deps, admins.system, {
      grantId: grant.grantId,
      reason: 'Görev süresi doldu',
    });
    expect(result.grantId).toBe(grant.grantId);
    expect(await db.adminGrant.findUniqueOrThrow({ where: { id: grant.grantId } })).toMatchObject({
      revokedById: admins.system,
    });
    await expectCode(
      permissions.requireAdmin({ kind: 'DEPARTMENT', departmentId: inst.deptA1 }),
      'AUTH_FORBIDDEN',
    );
    expect((await auditRows(grant.grantId)).map((row) => row.action)).toEqual([
      'ADMIN_GRANT',
      'ADMIN_REVOKE',
    ]);
    await expectCode(
      revokeAdmin(deps, admins.system, { grantId: grant.grantId, reason: 'Tekrar' }),
      'ADMIN_GRANT_NOT_ACTIVE',
    );
    await expectCode(
      revokeAdmin(deps, admins.system, { grantId: randomUUID(), reason: 'Tekrar' }),
      'RESOURCE_NOT_FOUND',
    );
  });

  it('kendi yetkini kaldıramazsın', async () => {
    const own = await db.adminGrant.findFirstOrThrow({
      where: { userId: admins.system, revokedAt: null },
    });
    await expectCode(
      revokeAdmin(deps, admins.system, { grantId: own.id, reason: REASON }),
      'ADMIN_SELF_ACTION',
    );
    expect((await db.adminGrant.findUniqueOrThrow({ where: { id: own.id } })).revokedAt).toBeNull();
  });

  it('YARIŞ: iki sistem yöneticisi aynı anda birbirini kaldırırsa yalnız biri başarılı olur; sistemde yönetici kalır', async () => {
    const a = await adminOf({ kind: 'SYSTEM' }, inst.deptA1);
    const b = await adminOf({ kind: 'SYSTEM' }, inst.deptA1);
    const grantOf = async (userId: string) =>
      (await db.adminGrant.findFirstOrThrow({ where: { userId, revokedAt: null } })).id;
    const [grantA, grantB] = [await grantOf(a), await grantOf(b)];
    const outcomes = await Promise.allSettled([
      revokeAdmin(deps, a, { grantId: grantB, reason: 'Karşılıklı kaldırma' }),
      revokeAdmin(deps, b, { grantId: grantA, reason: 'Karşılıklı kaldırma' }),
    ]);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find((o) => o.status === 'rejected');
    expect(
      isCodedError((rejected as PromiseRejectedResult).reason) &&
        (rejected as PromiseRejectedResult).reason.code,
    ).toBe('AUTH_FORBIDDEN');
    const remaining = await db.adminGrant.count({
      where: { id: { in: [grantA, grantB] }, revokedAt: null },
    });
    expect(remaining).toBe(1);
  });

  it('işlem kaydı yazılamazsa atama geri alınır', async () => {
    const candidate = await student(inst.deptA1);
    const failing = {
      ...db,
      $transaction: ((fn: (tx: unknown) => Promise<unknown>, options?: unknown) =>
        db.$transaction(
          (tx) =>
            fn(
              new Proxy(tx, {
                get: (object, property, receiver) =>
                  property === 'adminAuditLog'
                    ? {
                        create: async () => {
                          throw new Error('işlem kaydı kapalı');
                        },
                      }
                    : Reflect.get(object, property, receiver),
              }),
            ),
          options as never,
        )) as never,
    } as unknown as PrismaClient;
    await expect(
      grantAdmin({ db: failing }, admins.system, { scope: 'SYSTEM', userId: candidate.userId }),
    ).rejects.toThrow('işlem kaydı kapalı');
    expect(await db.adminGrant.count({ where: { userId: candidate.userId } })).toBe(0);
  });
});
