import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import {
  addGrant,
  addMembership,
  createInstitution,
  createUser,
  grantRequiredConsents,
} from '@/test/fixtures';
import { isCodedError } from '@/lib/errors';
import { getUsageMetrics, exportUsageMetrics } from './usage-metrics';
import { detachOldEvents, emitProfileThresholds, recordEvent, settleEvents } from './event';
import { deleteAccount } from './accountDeletion';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
const range = { from: new Date('2037-01-01'), to: new Date('2037-02-01') };
async function setup(consent = true) {
  const inst = await createInstitution(db);
  const admin = await createUser(db);
  await addMembership(db, { userId: admin, departmentId: inst.deptA1, role: 'ACADEMIC' });
  await addGrant(db, { userId: admin, scope: 'DEPARTMENT', departmentId: inst.deptA1 });
  if (consent) await grantRequiredConsents(db, admin);
  return { inst, admin };
}
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return isCodedError(e) ? e.code : 'unexpected';
  }
};
describe('bağımsız KVKK incelemesi', () => {
  it('rızası olmayan yöneticinin panel ve Excel sorgusu engellenir', async () => {
    const { admin } = await setup(false);
    expect(await code(getUsageMetrics({ db }, admin, range))).toBe('CONSENT_REQUIRED');
    expect(await code(exportUsageMetrics({ db }, admin, range))).toBe('CONSENT_REQUIRED');
  });
  it('iki kişilik hücre, toplam satırından da çıkarılamaz; üç kişi görünür', async () => {
    const { inst, admin } = await setup();
    for (let i = 0; i < 2; i++) {
      const userId = await createUser(db);
      await db.event.create({
        data: {
          type: 'LOGIN',
          role: 'STUDENT',
          departmentId: inst.deptA1,
          userId,
          props: { method: 'EMAIL_LINK' },
          createdAt: new Date('2037-01-02'),
        },
      });
    }
    const first = await getUsageMetrics({ db }, admin, { ...range, types: ['LOGIN'] });
    expect(first.cells).toEqual([]);
    expect(first.totalsByType[0]?.events).toBeNull();
    const userId = await createUser(db);
    await db.event.create({
      data: {
        type: 'LOGIN',
        role: 'STUDENT',
        departmentId: inst.deptA1,
        userId,
        props: { method: 'EMAIL_LINK' },
        createdAt: new Date('2037-01-02'),
      },
    });
    const second = await getUsageMetrics({ db }, admin, { ...range, types: ['LOGIN'] });
    expect(second.totalsByType[0]?.events).toBe(3);
    const otherDept = inst.deptA2;
    const system = await createUser(db);
    await addMembership(db, { userId: system, departmentId: inst.deptA1, role: 'ACADEMIC' });
    await addGrant(db, { userId: system, scope: 'FACULTY', facultyId: inst.facultyA });
    await grantRequiredConsents(db, system);
    const minority = await createUser(db);
    await db.event.create({
      data: {
        type: 'LOGIN',
        role: 'ALUMNI',
        departmentId: otherDept,
        userId: minority,
        props: { method: 'EMAIL_LINK' },
        createdAt: new Date('2037-01-02'),
      },
    });
    const combined = await getUsageMetrics({ db }, system, { ...range, types: ['LOGIN'] });
    expect(combined.cells).toHaveLength(1);
    expect(combined.cells[0]?.events).toBe(3);
    expect(combined.totalsByType[0]?.events).toBeNull();
  });
  it('hesap silindikten sonra gecikmiş olay kullanıcıya tekrar bağlanamaz', async () => {
    const { inst } = await setup();
    const userId = await createUser(db);
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await deleteAccount(
      db,
      userId,
      { publishedContent: 'DELETE', confirmEmail: user.email },
      { removeStoredFiles: async () => undefined },
    );
    await recordEvent(db, userId, { type: 'LOGIN', props: { method: 'EMAIL_LINK' } });
    expect(await db.event.count({ where: { userId } })).toBe(0);
  });
  it('eşzamanlı aynı profil eşiği yalnız bir olay üretir', async () => {
    const { inst } = await setup();
    const userId = await createUser(db);
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    for (let i = 0; i < 12; i++) emitProfileThresholds(db, userId, 40, 60);
    await settleEvents();
    expect(await db.event.count({ where: { userId, type: 'PROFILE_THRESHOLD' } })).toBe(1);
  });
  it('24 ayı aşan eşik bağı kopunca aynı eşiğin yeni geçişi yazılabilir', async () => {
    const { inst } = await setup();
    const userId = await createUser(db);
    await addMembership(db, {
      userId,
      departmentId: inst.deptA1,
      role: 'STUDENT',
      entryYear: 2024,
    });
    emitProfileThresholds(db, userId, 40, 60);
    await settleEvents();
    const prior = await db.event.findFirstOrThrow({ where: { userId, type: 'PROFILE_THRESHOLD' } });
    const old = new Date();
    old.setUTCMonth(old.getUTCMonth() - 25);
    await db.event.update({ where: { id: prior.id }, data: { createdAt: old } });
    await detachOldEvents(db, new Date());
    expect((await db.event.findUniqueOrThrow({ where: { id: prior.id } })).userId).toBeNull();
    emitProfileThresholds(db, userId, 40, 60);
    await settleEvents();
    expect(await db.event.count({ where: { userId, type: 'PROFILE_THRESHOLD' } })).toBe(1);
    expect(
      await db.event.count({ where: { departmentId: inst.deptA1, type: 'PROFILE_THRESHOLD' } }),
    ).toBe(2);
  });
});
