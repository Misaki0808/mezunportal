import { afterAll, describe, expect, it } from 'vitest';

import { DEFAULT_POINT_RULES, POINT_ACTIONS } from '@/contracts/points';
import { createTestPrisma } from '@/test/db';

import { seedPointRules } from './seed-points';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

describe('puan kuralı seed’i (K-11)', () => {
  it('başlangıç tablosunu yazar, tekrar koşunca değişmez ve yönetici değerini ezmez', async () => {
    await seedPointRules(db);
    const first = await db.pointRule.findMany({ orderBy: { action: 'asc' } });
    expect(first).toHaveLength(POINT_ACTIONS.length);
    for (const row of first) {
      expect(row).toMatchObject({ ...DEFAULT_POINT_RULES[row.action], isActive: true });
    }
    await db.pointRule.update({
      where: { action: 'SESSION_ONLINE' },
      data: { points: 12, isActive: false },
    });
    await seedPointRules(db);
    expect(await db.pointRule.count()).toBe(POINT_ACTIONS.length);
    expect(
      await db.pointRule.findUniqueOrThrow({ where: { action: 'SESSION_ONLINE' } }),
    ).toMatchObject({ points: 12, isActive: false });
    // temizlik: sonraki testler başlangıç değerini bekler
    await db.pointRule.update({
      where: { action: 'SESSION_ONLINE' },
      data: { ...DEFAULT_POINT_RULES.SESSION_ONLINE, isActive: true },
    });
  });
});
