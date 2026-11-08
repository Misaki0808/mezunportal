import { randomUUID } from 'node:crypto';
import { afterAll, expect, it, vi } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';
import { CONTACT_FIELDS } from '@/contracts/privacy';
import { previewContactTarget } from './contactRequest';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
it('hedef olmayan tüm biçimler aynı yanıtı ve aynı sorgu akışını üretir', async () => {
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
  for (const targetUserId of Object.values(cases)) {
    userLookup.mockClear();
    visibilityLookup.mockClear();
    const actual = await previewContactTarget(db, requester, { targetUserId });
    expect(actual).toEqual({ canRequest: false, displayName: null, requestableFields: [] });
    expect(userLookup).toHaveBeenCalledTimes(1);
    expect(visibilityLookup).toHaveBeenCalledTimes(1);
  }
});
