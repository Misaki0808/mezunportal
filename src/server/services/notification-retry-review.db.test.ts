import { afterAll, describe, expect, it } from 'vitest';

import { Prisma } from '@/generated/prisma/client';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

import { notificationIntentPayload, relayNotificationIntents } from './notification-intent';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

const good = (eventId: string) => ({
  type: 'generic',
  event: 'contact',
  eventId,
  path: '/hesap/iletisim',
});
const MINUTE = 60_000;

/** Bağımsız inceleme: gerçek sözleşme çözümleyicisiyle bozuk yük atan, öbürlerini gönderen aktarıcı. */
function sender(sent: string[]) {
  return async (row: { userId: string; payload: Prisma.JsonValue }) => {
    const payload = notificationIntentPayload.parse(row.payload); // bozuk yükte ZodError fırlatır
    if (payload.type === 'generic') sent.push(payload.eventId);
  };
}

describe('TD-017 bağımsız inceleme senaryoları', () => {
  it('bozuk yük (Zod hatası) 130 niyetin başında olsa da hepsi aynı çalıştırmada gider; bozuk niyet 5 denemede FAILED olur', async () => {
    const poisoned = await createUser(db);
    const healthy = await createUser(db);
    const tag = `rv-${Date.now()}`;
    // uuid v7 sıralı: bozuk niyet en küçük kimlikle (ilk sayfada) oluşturulur
    const bad = await db.notificationIntent.create({
      data: { key: `${tag}-bad`, userId: poisoned, kind: 'generic', payload: { garbage: true } },
    });
    for (let i = 0; i < 130; i += 1)
      await db.notificationIntent.create({
        data: {
          key: `${tag}-${i}`,
          userId: healthy,
          kind: 'generic',
          payload: good(`${tag}-${i}`),
        },
      });
    let now = new Date(Date.now() + 1000);
    const sent: string[] = [];
    const first = await relayNotificationIntents(db, sender(sent), { now: () => now });
    expect(sent.filter((id) => id.startsWith(tag))).toHaveLength(130);
    expect(first.failed).toBeGreaterThanOrEqual(1);
    expect(await db.notificationIntent.count({ where: { userId: healthy } })).toBe(0);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const row = await db.notificationIntent.findUniqueOrThrow({ where: { id: bad.id } });
      expect(row.attemptCount).toBe(attempt);
      if (attempt === 5) {
        expect(row).toMatchObject({ status: 'FAILED', payload: null, nextAttemptAt: null });
        break;
      }
      expect(row.nextAttemptAt!.getTime() - now.getTime()).toBe(MINUTE * 2 ** (attempt - 1));
      now = row.nextAttemptAt!;
      await relayNotificationIntents(db, sender([]), { now: () => now });
    }
    // 5. denemeden sonra bir daha seçilmez
    const calls: string[] = [];
    await relayNotificationIntents(
      db,
      async (row) => {
        calls.push(row.userId);
      },
      { now: () => new Date(now.getTime() + 7 * 86_400_000) },
    );
    expect(calls).not.toContain(poisoned);
    expect(
      (await db.notificationIntent.findUniqueOrThrow({ where: { id: bad.id } })).attemptCount,
    ).toBe(5);
  });

  it('başka bir işlemin kilitlediği niyet atlanır (SKIP LOCKED), diğerleri gider ve kilitli niyetin sayacı değişmez', async () => {
    const owner = await createUser(db);
    const other = await createUser(db);
    const tag = `rv-lock-${Date.now()}`;
    const locked = await db.notificationIntent.create({
      data: { key: `${tag}-a`, userId: owner, kind: 'generic', payload: good(`${tag}-a`) },
    });
    await db.notificationIntent.create({
      data: { key: `${tag}-b`, userId: other, kind: 'generic', payload: good(`${tag}-b`) },
    });
    const now = new Date(Date.now() + 1000);
    const sent: string[] = [];
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "NotificationIntent" WHERE "id"=${locked.id} FOR UPDATE`;
        await held;
      },
      { timeout: 20_000 },
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const result = await relayNotificationIntents(db, sender(sent), { now: () => now });
    release();
    await blocker;
    expect(sent).toEqual([`${tag}-b`]);
    expect(result.failed).toBe(0);
    const row = await db.notificationIntent.findUniqueOrThrow({ where: { id: locked.id } });
    expect(row).toMatchObject({ status: 'PENDING', attemptCount: 0 });
  });

  it('başarılı gönderim denemeyi saymaz: bir kez hata, sonra başarı niyeti siler', async () => {
    const userId = await createUser(db);
    const tag = `rv-flaky-${Date.now()}`;
    const row = await db.notificationIntent.create({
      data: { key: tag, userId, kind: 'generic', payload: good(tag) },
    });
    let now = new Date(Date.now() + 1000);
    let fail = true;
    const flaky = async () => {
      if (fail) throw new Error('geçici sağlayıcı hatası');
    };
    await relayNotificationIntents(db, flaky, { now: () => now });
    const after = await db.notificationIntent.findUniqueOrThrow({ where: { id: row.id } });
    expect(after).toMatchObject({ status: 'PENDING', attemptCount: 1 });
    fail = false;
    // bekleme dolmadan: gönderilmez
    await relayNotificationIntents(db, flaky, { now: () => new Date(now.getTime() + 30_000) });
    expect(await db.notificationIntent.count({ where: { id: row.id } })).toBe(1);
    now = after.nextAttemptAt!;
    const result = await relayNotificationIntents(db, flaky, { now: () => now });
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(await db.notificationIntent.count({ where: { id: row.id } })).toBe(0);
  });
});
