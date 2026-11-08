import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { consumeStillThere, stillThereToken } from './still-there';
const db = createTestPrisma();
afterAll(() => db.$disconnect());
describe('imzalı mezun yanıtı', () => {
  it('eşzamanlı karşıt yanıtlar tek kullanım, süre ve hesap kontrolüne uyar', async () => {
    const user = await db.user.create({
      data: { name: 'Deneme', email: `${randomUUID()}@example.invalid`, profile: { create: {} } },
    });
    const position = await db.position.create({
      data: {
        userId: user.id,
        companyRaw: 'Kurum',
        titleRaw: 'Görev',
        source: 'MANUAL',
        isCurrent: true,
      },
    });
    const now = new Date();
    const action = await db.notificationAction.create({
      data: {
        userId: user.id,
        positionId: position.id,
        cycle: randomUUID(),
        expiresAt: new Date(now.getTime() + 1000),
      },
    });
    const yes = { token: stillThereToken(action.id, 'YES', 'secret'), choice: 'YES' as const };
    const no = { token: stillThereToken(action.id, 'NO', 'secret'), choice: 'NO' as const };
    expect(await consumeStillThere(db, yes, 'secret', 'other', now)).toBeNull();
    expect(
      await consumeStillThere(db, yes, 'secret', user.id, new Date(now.getTime() + 1001)),
    ).toBeNull();
    expect(
      await consumeStillThere(db, { ...yes, choice: 'NO' }, 'secret', user.id, now),
    ).toBeNull();
    const results = await Promise.all([
      consumeStillThere(db, yes, 'secret', user.id, now),
      consumeStillThere(db, no, 'secret', user.id, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeStillThere(db, yes, 'secret', user.id, now)).toBeNull();
  });
});
