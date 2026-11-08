import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const now = new Date('2030-06-20T12:00:00Z');
let user: string;
let other: string;
beforeAll(async () => {
  user = await createUser(db);
  other = await createUser(db);
});

const base = (sourceId: string) => ({
  userId: user,
  action: 'SESSION_ONLINE' as const,
  sourceType: 'APPOINTMENT' as const,
  sourceId,
  basePoints: 10,
  multiplierPercent: 100,
  points: 10,
  status: 'FINAL' as const,
  eventAt: now,
});

describe('puan tablosu veritabanı değişmezleri', () => {
  it('geçerli kayıtlar yazılır', async () => {
    await expect(db.pointEntry.create({ data: base('ok-1') })).resolves.toBeTruthy();
    await expect(
      db.pointEntry.create({
        data: { ...base('ok-2'), status: 'PENDING', finalizesAt: now },
      }),
    ).resolves.toBeTruthy();
    await expect(
      db.pointEntry.create({
        data: {
          ...base('ok-3'),
          status: 'REVOKED',
          revokedAt: now,
          revokedReason: 'ADMIN_CANCEL',
        },
      }),
    ).resolves.toBeTruthy();
  });

  it('aynı olay iki kez puan üretemez (benzersiz anahtar)', async () => {
    await db.pointEntry.create({ data: base('dup-1') });
    await expect(db.pointEntry.create({ data: base('dup-1') })).rejects.toThrow();
    // farklı eylem ya da kaynak türü ayrı anahtardır
    await expect(
      db.pointEntry.create({ data: { ...base('dup-1'), action: 'SESSION_IN_PERSON' } }),
    ).resolves.toBeTruthy();
  });

  it.each([
    ['puan, taban × çarpan / 100 ile uyuşmuyor', { points: 9 }],
    ['çarpan 100 üstü', { multiplierPercent: 101, points: 10 }],
    ['negatif çarpan', { multiplierPercent: -1, points: 0 }],
    ['negatif taban puan', { basePoints: -1, points: 0 }],
    ['PENDING kesinleşme anı olmadan', { status: 'PENDING' as const }],
    [
      'PENDING geri alma bilgisiyle',
      { status: 'PENDING' as const, finalizesAt: now, revokedAt: now },
    ],
    ['REVOKED nedensiz', { status: 'REVOKED' as const, revokedAt: now }],
    [
      'REVOKED geri alma anı olmadan',
      { status: 'REVOKED' as const, revokedReason: 'ADMIN_CANCEL' as const },
    ],
    ['FINAL geri alma bilgisiyle', { revokedAt: now, revokedReason: 'FRAUD_CONFIRMED' as const }],
    ['kendi kendine karşı taraf', { counterpartId: 'SELF' }],
  ])('%s reddedilir', async (_name, patch) => {
    await expect(
      db.pointEntry.create({
        data: {
          ...base(`bad-${_name}`),
          ...patch,
          ...('counterpartId' in patch ? { counterpartId: user } : {}),
        },
      }),
    ).rejects.toThrow();
  });

  it('kesirli çarpanlarda puan aşağı yuvarlanmış olmalıdır', async () => {
    await expect(
      db.pointEntry.create({
        data: { ...base('floor-1'), multiplierPercent: 25, points: 2 },
      }),
    ).resolves.toBeTruthy();
    await expect(
      db.pointEntry.create({
        data: { ...base('floor-2'), multiplierPercent: 25, points: 3 },
      }),
    ).rejects.toThrow();
  });

  it('kural değerleri sınırlıdır', async () => {
    for (const patch of [{ points: 101 }, { points: -1 }, { delayDays: 31 }, { delayDays: -1 }]) {
      await expect(
        db.pointRule.upsert({
          where: { action: 'FAQ_ANSWER_SELECTED' },
          create: { action: 'FAQ_ANSWER_SELECTED', points: 5, delayDays: 0, ...patch },
          update: patch,
        }),
      ).rejects.toThrow();
    }
  });

  it('şüphe işareti: OPEN karar anı taşımaz, kararlı işaret taşır; kullanıcı+kural başına tek OPEN', async () => {
    const flag = (evidenceKey: string, patch: object = {}) => ({
      userId: other,
      rule: 'BURST' as const,
      evidenceKey,
      entryIds: [],
      windowStart: now,
      windowEnd: now,
      entryCount: 0,
      points: 0,
      ...patch,
    });
    await expect(
      db.suspicionFlag.create({ data: flag('k1', { decidedAt: now }) }),
    ).rejects.toThrow();
    await expect(
      db.suspicionFlag.create({ data: flag('k2', { status: 'CONFIRMED' }) }),
    ).rejects.toThrow();
    await db.suspicionFlag.create({ data: flag('k3') });
    await expect(db.suspicionFlag.create({ data: flag('k4') })).rejects.toThrow();
    await expect(
      db.suspicionFlag.create({ data: flag('k5', { rule: 'SYNC_FEEDBACK' }) }),
    ).resolves.toBeTruthy();
    // karara bağlanmış işaret yenisine engel olmaz; aynı kanıt yine de tekrar yazılamaz
    await expect(
      db.suspicionFlag.create({
        data: flag('k6', { status: 'DISMISSED', decidedAt: now, rule: 'SINGLE_COUNTERPART' }),
      }),
    ).resolves.toBeTruthy();
    await expect(
      db.suspicionFlag.create({
        data: flag('k6', { rule: 'SINGLE_COUNTERPART' }),
      }),
    ).rejects.toThrow();
    await expect(
      db.suspicionFlag.create({ data: flag('k7', { rule: 'SINGLE_COUNTERPART' }) }),
    ).resolves.toBeTruthy();
  });

  it('kurucu üye etiketi kullanıcı başına bir kez', async () => {
    await db.userBadge.create({ data: { userId: other, kind: 'FOUNDING_MEMBER' } });
    await expect(
      db.userBadge.create({ data: { userId: other, kind: 'FOUNDING_MEMBER' } }),
    ).rejects.toThrow();
  });
});
