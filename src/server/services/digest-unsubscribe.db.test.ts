import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { digestUnsubscribeToken } from '../rules/digest-unsubscribe';
import { unsubscribeMonthlyDigest } from './digest-unsubscribe';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

it('girişsiz imza yalnız kendi aylık tercihini kapatır ve yeniden çalıştırılabilir', async () => {
  const one = await db.user.create({
    data: { name: 'A', email: `${randomUUID()}@example.invalid` },
  });
  const other = await db.user.create({
    data: { name: 'B', email: `${randomUUID()}@example.invalid` },
  });
  const token = digestUnsubscribeToken(one.id, 'secret');
  await unsubscribeMonthlyDigest(db, token, 'wrong-secret');
  expect(await db.notificationPreference.count({ where: { userId: one.id } })).toBe(0);
  await Promise.all([
    unsubscribeMonthlyDigest(db, token, 'secret'),
    unsubscribeMonthlyDigest(db, token, 'secret'),
  ]);
  expect(
    await db.notificationPreference.findUnique({
      where: { userId_type: { userId: one.id, type: 'MONTHLY_DIGEST' } },
    }),
  ).toMatchObject({ enabled: false });
  expect(await db.notificationPreference.count({ where: { userId: other.id } })).toBe(0);
  expect(await db.notificationPreference.count({ where: { userId: one.id } })).toBe(1);
});
