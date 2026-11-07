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
