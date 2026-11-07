import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { PROFILE_TAG_SEED, seedProfileTags } from './seed-profile-tags';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('sabit etiket seed tekrarlanabilir ve çift kayıt üretmez', async () => {
  await seedProfileTags(db);
  await seedProfileTags(db);
  for (const tag of PROFILE_TAG_SEED) {
    expect(await db.tag.count({ where: tag })).toBe(1);
  }
});

it('adım durumu CHECK: listeler ayrık, zorunlu adım ve COMPLETE atlanamaz', async () => {
  const user = await db.user.create({
    data: { name: 'Adım Testi', email: `adim-${Date.now()}@ogr.iu.edu.tr` },
  });
  const profile = await db.profile.create({ data: { userId: user.id } });
  expect(profile.completedSteps).toEqual([]);
  expect(profile.skippedSteps).toEqual([]);
  await db.profile.update({
    where: { id: profile.id },
    data: { completedSteps: ['MEMBERSHIP', 'GOALS'], skippedSteps: ['INTERESTS'] },
  });
  for (const data of [
    { completedSteps: ['GOALS' as const], skippedSteps: ['GOALS' as const] },
    { skippedSteps: ['MEMBERSHIP' as const] },
    { skippedSteps: ['COMPLETE' as const] },
    { completedSteps: ['COMPLETE' as const] },
  ]) {
    await expect(db.profile.update({ where: { id: profile.id }, data })).rejects.toThrow(
      /Profile_step_status_check/,
    );
  }
});
