import { afterAll, describe, expect, it } from 'vitest';

import { isCodedError } from '@/lib/errors';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

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
