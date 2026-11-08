import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';
import { CONTACT_FIELDS } from '@/contracts/privacy';
import { previewContactTarget } from './contactRequest';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('hedef olmayan tüm biçimler aynı yanıtı üretir; yerel süreler ölçülür', async () => {
  const requester = await createUser(db);
  const deleted = await createUser(db, { deletedAt: new Date() });
  const banned = await createUser(db, { banned: true });
  const hidden = await createUser(db);
  await db.fieldVisibility.createMany({
    data: CONTACT_FIELDS.map((field) => ({ userId: hidden, field, level: 'PRIVATE' as const })),
  });
  const cases = { self: requester, absent: randomUUID(), deleted, banned, hidden };
  const userLookup = vi.spyOn(db.user, 'findUnique');
  const visibilityLookup = vi.spyOn(db.fieldVisibility, 'findMany');
  const timings: Record<string, number[]> = Object.fromEntries(
    Object.keys(cases).map((key) => [key, []]),
  );
  for (let round = 0; round < 10; round++)
    for (const [label, targetUserId] of Object.entries(cases)) {
      userLookup.mockClear();
      visibilityLookup.mockClear();
      const started = performance.now();
      const actual = await previewContactTarget(db, requester, { targetUserId });
      timings[label]!.push(performance.now() - started);
      expect(actual).toEqual({ canRequest: false, displayName: null, requestableFields: [] });
      expect(userLookup).toHaveBeenCalledTimes(1);
      expect(visibilityLookup).toHaveBeenCalledTimes(1);
    }
  const median = Object.fromEntries(
    Object.entries(timings).map(([key, values]) => [
      key,
      Number(values.sort((a, b) => a - b)[5]!.toFixed(2)),
    ]),
  );
  console.log('Önizleme yerel medyan ms:', JSON.stringify(median));
});
