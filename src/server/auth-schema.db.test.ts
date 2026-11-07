import { afterAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createInstitution, createUser, unique } from '@/test/fixtures';

const prisma = createTestPrisma();
afterAll(() => prisma.$disconnect());

async function expectDbReject(operation: Promise<unknown>, constraint: string) {
  const error = await operation.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error, `${constraint} ihlali bekleniyordu`).not.toBeNull();
  expect(String((error as Error).message) + JSON.stringify(error)).toContain(constraint);
}

describe('Better Auth tabloları (Session, Account, Verification, RateLimit)', () => {
  it('oturum: jeton benzersiz; kullanıcı silinince oturumlar ve hesap bağlantıları da silinir', async () => {
    const userId = await createUser(prisma);
    const token = unique('jeton');
    await prisma.session.create({
      data: { userId, token, expiresAt: new Date(Date.now() + 3_600_000), ipAddress: '127.0.0.1' },
    });
    await expect(
      prisma.session.create({ data: { userId, token, expiresAt: new Date() } }),
    ).rejects.toThrow();
    await prisma.account.create({
      data: { userId, providerId: 'linkedin', accountId: unique('hesap') },
    });

    await prisma.user.delete({ where: { id: userId } });

    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect(await prisma.account.count({ where: { userId } })).toBe(0);
  });

  it('hesap bağlantısı: aynı sağlayıcı hesabı iki kez eklenemez; farklı kullanıcıya bağlanamaz', async () => {
    const accountId = unique('linkedin-hesap');
    const first = await createUser(prisma);
    await prisma.account.create({ data: { userId: first, providerId: 'linkedin', accountId } });
    const second = await createUser(prisma);
    await expectDbReject(
      prisma.account.create({ data: { userId: second, providerId: 'linkedin', accountId } }),
      'Account_providerId_accountId_key',
    );
    // aynı kullanıcı için farklı sağlayıcı serbest
    await prisma.account.create({ data: { userId: first, providerId: 'github', accountId } });
  });

  it('User.role isteğe bağlıdır (admin eklentisi alanı) ve boş bırakılabilir', async () => {
    const userId = await createUser(prisma);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.role).toBeNull();
    expect(user.banned).toBe(false);
  });

  it('Verification ve RateLimit satırları yazılır; hız sınırı anahtarı benzersiz', async () => {
    const key = unique('127.0.0.1/sign-in/magic-link');
    await prisma.verification.create({
      data: { identifier: unique('id'), value: 'jeton', expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.rateLimit.create({ data: { key, count: 1, lastRequest: BigInt(Date.now()) } });
    await expect(
      prisma.rateLimit.create({ data: { key, count: 2, lastRequest: BigInt(Date.now()) } }),
    ).rejects.toThrow();
  });
});

describe('GraduationDocument kısıtları', () => {
  async function setup() {
    const inst = await createInstitution(prisma);
    const userId = await createUser(prisma);
    const reviewerId = await createUser(prisma);
    return { inst, userId, reviewerId };
  }
  const pendingData = (userId: string, departmentId: string) => ({
    userId,
    departmentId,
    graduationYear: 2025,
    storageKey: `graduation/${userId}/${unique('dosya')}.pdf`,
  });

  it('bekleyen belge yazılır (varsayılan durum PENDING, dosya anahtarı dolu, karar alanları boş)', async () => {
    const { inst, userId } = await setup();
    const doc = await prisma.graduationDocument.create({ data: pendingData(userId, inst.deptA1) });
    expect(doc).toMatchObject({
      status: 'PENDING',
      reviewedAt: null,
      reviewedById: null,
      rejectReason: null,
    });
    expect(doc.storageKey).toMatch(/^graduation\//);
  });

  it('aynı kullanıcı+bölüm için ikinci BEKLEYEN belge reddedilir; karardan sonra yenisi yüklenebilir', async () => {
    const { inst, userId, reviewerId } = await setup();
    const first = await prisma.graduationDocument.create({
      data: pendingData(userId, inst.deptA1),
    });
    await expectDbReject(
      prisma.graduationDocument.create({ data: pendingData(userId, inst.deptA1) }),
      'GraduationDocument_pending_user_department_key',
    );
    // başka bölüme bekleyen belge serbest
    await prisma.graduationDocument.create({ data: pendingData(userId, inst.deptA2) });

    await prisma.graduationDocument.update({
      where: { id: first.id },
      data: {
        status: 'REJECTED',
        storageKey: null,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        rejectReason: 'Barkod doğrulanamadı.',
      },
    });
    await expect(
      prisma.graduationDocument.create({ data: pendingData(userId, inst.deptA1) }),
    ).resolves.toBeDefined();
  });

  it('onay: dosya anahtarı null, karar alanları dolu, gerekçe yok', async () => {
    const { inst, userId, reviewerId } = await setup();
    const doc = await prisma.graduationDocument.create({ data: pendingData(userId, inst.deptA1) });
    const approved = await prisma.graduationDocument.update({
      where: { id: doc.id },
      data: {
        status: 'APPROVED',
        storageKey: null,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });
    expect(approved).toMatchObject({ status: 'APPROVED', storageKey: null, rejectReason: null });
  });

  it.each([
    [
      'onaylandı ama dosya anahtarı duruyor (dosya silinmemiş)',
      { status: 'APPROVED', keepKey: true, decided: true },
    ],
    [
      'reddedildi ama dosya anahtarı duruyor',
      { status: 'REJECTED', keepKey: true, decided: true, reason: 'Geçersiz belge.' },
    ],
    ['reddedildi ama gerekçe yok', { status: 'REJECTED', decided: true }],
    [
      'onaylandı ama gerekçe var',
      { status: 'APPROVED', decided: true, reason: 'Gerekçe olmamalı.' },
    ],
    ['onaylandı ama karar zamanı/kullanıcısı yok', { status: 'APPROVED', decided: false }],
    [
      'bekliyor ama ret gerekçesi var',
      { status: 'PENDING', keepKey: true, decided: false, reason: 'Erken gerekçe.' },
    ],
    ['reddedildi, gerekçe çok kısa', { status: 'REJECTED', decided: true, reason: 'ab' }],
  ] as const)('karar tutarlılığı: %s', async (_label, spec) => {
    const { inst, userId, reviewerId } = await setup();
    const doc = await prisma.graduationDocument.create({ data: pendingData(userId, inst.deptA1) });
    await expectDbReject(
      prisma.graduationDocument.update({
        where: { id: doc.id },
        data: {
          status: spec.status,
          storageKey: 'keepKey' in spec ? doc.storageKey : null,
          reviewedAt: spec.decided ? new Date() : null,
          reviewedById: spec.decided ? reviewerId : null,
          rejectReason: 'reason' in spec ? spec.reason : null,
        },
      }),
      'GraduationDocument_decision_consistent_check',
    );
  });

  it('bekleyen belgenin dosya anahtarı boş olamaz; anahtar graduation/ önekli olmalı; yıl aralığı', async () => {
    const { inst, userId } = await setup();
    await expectDbReject(
      prisma.graduationDocument.create({
        data: { ...pendingData(userId, inst.deptA1), storageKey: null },
      }),
      'GraduationDocument_decision_consistent_check',
    );
    await expectDbReject(
      prisma.graduationDocument.create({
        data: { ...pendingData(userId, inst.deptA1), storageKey: 'cv/x/y.pdf' },
      }),
      'GraduationDocument_decision_consistent_check',
    );
    await expectDbReject(
      prisma.graduationDocument.create({
        data: { ...pendingData(userId, inst.deptA1), graduationYear: 1900 },
      }),
      'GraduationDocument_decision_consistent_check',
    );
  });

  it('belgesi olan kullanıcı ve bölüm silinemez (geçmiş korunur)', async () => {
    const { inst, userId } = await setup();
    await prisma.graduationDocument.create({ data: pendingData(userId, inst.deptA1) });
    await expect(prisma.user.delete({ where: { id: userId } })).rejects.toThrow();
    await expect(prisma.department.delete({ where: { id: inst.deptA1 } })).rejects.toThrow();
  });
});

describe('EmailLog kısıtları', () => {
  const base = () => ({ idempotencyKey: unique('anahtar'), template: 'sign-in-link' });

  it('kayıt yazılır; varsayılan QUEUED, 0 deneme; alıcı adresi saklanmaz', async () => {
    const log = await prisma.emailLog.create({ data: base() });
    expect(log).toMatchObject({
      status: 'QUEUED',
      attempts: 0,
      recipientUserId: null,
      sentAt: null,
    });
    expect(Object.keys(log).sort()).toEqual([
      'attempts',
      'createdAt',
      'errorCode',
      'id',
      'idempotencyKey',
      'recipientUserId',
      'sentAt',
      'status',
      'template',
      'updatedAt',
    ]);
  });

  it('aynı idempotency anahtarıyla ikinci kayıt reddedilir (ikinci gönderim yok)', async () => {
    const data = base();
    await prisma.emailLog.create({ data });
    await expect(prisma.emailLog.create({ data })).rejects.toThrow();
  });

  it('SENT ile sentAt birlikte olmalı', async () => {
    await expectDbReject(
      prisma.emailLog.create({ data: { ...base(), status: 'SENT' } }),
      'EmailLog_shape_check',
    );
    await expectDbReject(
      prisma.emailLog.create({ data: { ...base(), status: 'QUEUED', sentAt: new Date() } }),
      'EmailLog_shape_check',
    );
    await expect(
      prisma.emailLog.create({ data: { ...base(), status: 'SENT', sentAt: new Date() } }),
    ).resolves.toBeDefined();
  });

  it('negatif deneme ve uzunluk sınırları reddedilir', async () => {
    await expectDbReject(
      prisma.emailLog.create({ data: { ...base(), attempts: -1 } }),
      'EmailLog_shape_check',
    );
    await expectDbReject(
      prisma.emailLog.create({ data: { ...base(), idempotencyKey: 'x'.repeat(201) } }),
      'EmailLog_shape_check',
    );
    await expectDbReject(
      prisma.emailLog.create({ data: { ...base(), template: '' } }),
      'EmailLog_shape_check',
    );
  });

  it('alıcı kullanıcı silinirse kayıt kalır, alıcı kimliği boşalır (SetNull)', async () => {
    const userId = await createUser(prisma);
    const log = await prisma.emailLog.create({ data: { ...base(), recipientUserId: userId } });
    await prisma.user.delete({ where: { id: userId } });
    expect(
      (await prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } })).recipientUserId,
    ).toBeNull();
  });
});
