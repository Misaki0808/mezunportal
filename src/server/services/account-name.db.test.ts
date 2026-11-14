import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

import { DELETED_USER_NAME, deleteAccount } from './accountDeletion';
import { getMyAccountName, updateMyName } from './account-name';

const db = createTestPrisma();
const deps = { db };
afterAll(() => db.$disconnect());

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return isCodedError(error) ? error.code : 'KODSUZ';
  }
  return null;
};
const auditOf = (userId: string) =>
  db.adminAuditLog.findMany({ where: { targetId: userId }, orderBy: { createdAt: 'asc' } });

describe('hesap adı servisi', () => {
  it('kendi adını değiştirir; işlem kaydı yalnız "ad değişti" der, eski ve yeni ad kayda girmez', async () => {
    const userId = await createUser(db, { name: 'ayse yilmaz1989' });
    const result = await updateMyName(deps, userId, '  Ayşe   Yılmaz ');
    expect(result).toEqual({ name: 'Ayşe Yılmaz', changed: true });
    expect(await getMyAccountName(deps, userId)).toEqual({ name: 'Ayşe Yılmaz' });

    const audit = await auditOf(userId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: userId,
      action: 'USER_NAME_CHANGE',
      targetType: 'USER',
      targetId: userId,
      reason: null,
      metadata: {},
    });
    const row = JSON.stringify(audit[0]);
    expect(row).not.toContain('Ayşe');
    expect(row).not.toContain('Yılmaz');
    expect(row).not.toContain('yilmaz');
    expect(row).not.toContain('1989');
  });

  it('aynı ad yeniden gönderilirse hiçbir şey yazılmaz: ne işlem kaydı ne hız sınırı sayacı', async () => {
    const userId = await createUser(db, { name: 'Mehmet Demir' });
    const result = await updateMyName(deps, userId, 'Mehmet   Demir');
    expect(result).toEqual({ name: 'Mehmet Demir', changed: false });
    expect(await auditOf(userId)).toHaveLength(0);
    expect(await db.rateLimit.count({ where: { key: { contains: userId } } })).toBe(0);
  });

  it('başka kullanıcıların adı ve kaydı değişmez', async () => {
    const mine = await createUser(db, { name: 'Eski Ad' });
    const other = await createUser(db, { name: 'Diğer Kişi' });
    await updateMyName(deps, mine, 'Yeni Ad');
    expect(await getMyAccountName(deps, other)).toEqual({ name: 'Diğer Kişi' });
    expect(await auditOf(other)).toHaveLength(0);
  });

  it('geçersiz ad sunucuda reddedilir ve hiçbir şey yazmaz (rakam, e-posta, kısa, uzun)', async () => {
    const userId = await createUser(db, { name: 'Sağlam Ad' });
    for (const bad of ['r1', 'ayse@iu.edu.tr', 'A', 'a'.repeat(81), '   ', 'Ayşe_Yılmaz']) {
      expect(await codeOf(updateMyName(deps, userId, bad))).toBe('ACCOUNT_NAME_INVALID');
    }
    expect(await getMyAccountName(deps, userId)).toEqual({ name: 'Sağlam Ad' });
    expect(await auditOf(userId)).toHaveLength(0);
  });

  it("saatte 10 değişiklik: 11.si RATE_LIMITED olur, ad ve kayıt sayısı 10'da kalır; pencere geçince yeniden açılır", async () => {
    const userId = await createUser(db, { name: 'Başlangıç Adı' });
    const start = new Date('2030-01-01T10:00:00Z');
    const names = Array.from({ length: 10 }, (_, i) => `Ad${'a'.repeat(i + 1)}`);
    for (const name of names) await updateMyName({ db, now: () => start }, userId, name);
    expect(await codeOf(updateMyName({ db, now: () => start }, userId, 'Fazla Ad'))).toBe(
      'RATE_LIMITED',
    );
    expect(await getMyAccountName(deps, userId)).toEqual({ name: names.at(-1) });
    expect(await auditOf(userId)).toHaveLength(10);
    const later = new Date(start.getTime() + 61 * 60 * 1000);
    expect(await updateMyName({ db, now: () => later }, userId, 'Fazla Ad')).toEqual({
      name: 'Fazla Ad',
      changed: true,
    });
  });

  it('olmayan kullanıcı için bulunamadı döner', async () => {
    const missing = '018f0000-0000-7000-8000-00000000dead';
    expect(await codeOf(getMyAccountName(deps, missing))).toBe('RESOURCE_NOT_FOUND');
    expect(await codeOf(updateMyName(deps, missing, 'Ayşe Yılmaz'))).toBe('RESOURCE_NOT_FOUND');
  });
});

describe('hesap silme ile ad güncelleme yarışı (W2 363, P1)', () => {
  async function userWithEmail(name: string) {
    const userId = await createUser(db, { name });
    const email = `yaris-${randomUUID()}@example.test`;
    await db.user.update({ where: { id: userId }, data: { email } });
    return { userId, email };
  }
  const del = (
    userId: string,
    email: string,
    handlers: Parameters<typeof deleteAccount>[3]['handlers'] = [],
  ) =>
    deleteAccount(
      db,
      userId,
      { publishedContent: 'DELETE', confirmEmail: email },
      {
        handlers,
        removeStoredFiles: null,
      },
    );
  const waitForLockWait = async () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rows = await db.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
          AND pid <> pg_backend_pid() AND wait_event_type = 'Lock') AS waiting`;
      if (rows[0]?.waiting) return true;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return false;
  };

  it('silme bittikten sonra devam eden önceden yetkilendirilmiş ad isteği hiçbir şey yazmaz', async () => {
    const { userId, email } = await userWithEmail('Gerçek Ad');
    await del(userId, email);
    expect(await codeOf(updateMyName(deps, userId, 'Yeni Gerçek Ad'))).toBe('RESOURCE_NOT_FOUND');
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.name).toBe(DELETED_USER_NAME);
    expect(await auditOf(userId)).toHaveLength(0);
  });

  it('GERÇEK yarış: silme işlemi açıkken gelen ad isteği satır kilidinde bekler, silme bitince reddedilir; anonim ad korunur', async () => {
    const { userId, email } = await userWithEmail('Gerçek Ad');
    let release!: () => void;
    let locked!: () => void;
    const deletionLocked = new Promise<void>((resolve) => (locked = resolve));
    const proceed = new Promise<void>((resolve) => (release = resolve));
    const deletion = del(userId, email, [
      async () => {
        locked();
        await proceed;
      },
    ]);
    try {
      await deletionLocked;
      const rename = updateMyName(deps, userId, 'Yeni Gerçek Ad').then(
        () => 'OK',
        (error: unknown) => (isCodedError(error) ? error.code : 'KODSUZ'),
      );
      // Ad isteği gerçek PostgreSQL kilidinde bekleyene kadar silme açık kalır.
      expect(await waitForLockWait()).toBe(true);
      release();
      await deletion;
      expect(await rename).toBe('RESOURCE_NOT_FOUND');
      const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(row.name).toBe(DELETED_USER_NAME);
      expect(row.deletedAt).not.toBeNull();
      expect(await auditOf(userId)).toHaveLength(0);
    } finally {
      release();
    }
  });

  it('ad önce biterse silme onu anonimleştirir; işlem kaydında ad kalmaz', async () => {
    const { userId, email } = await userWithEmail('Gerçek Ad');
    await updateMyName(deps, userId, 'Başka Gerçek Ad');
    await del(userId, email);
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.name).toBe(DELETED_USER_NAME);
    const audit = await auditOf(userId);
    expect(audit.filter((entry) => entry.action === 'USER_NAME_CHANGE')).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('Gerçek');
  });

  it('aynı anda başlatılan ad değiştirme ve silme tekrarlanan denemelerde hep anonim adla biter', async () => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const { userId, email } = await userWithEmail('Gerçek Ad');
      const [, rename] = await Promise.allSettled([
        attempt % 2 === 0 ? del(userId, email) : Promise.resolve(),
        updateMyName(deps, userId, 'Yeni Gerçek Ad'),
        attempt % 2 === 1 ? del(userId, email) : Promise.resolve(),
      ]);
      expect(['fulfilled', 'rejected']).toContain(rename.status);
      const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
      expect(row.name).toBe(DELETED_USER_NAME);
    }
  });
});
