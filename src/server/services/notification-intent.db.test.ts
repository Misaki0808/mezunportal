import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';
import { FakeEmailTransport } from '../external/email/fake';
import { createEmailQueue, EMAIL_QUEUE, startEmailConsumer } from '../jobs/email-queue';
import { createEmailOutbox } from '../jobs/email-outbox';
import { createEmailService } from '../jobs/email-core';
import { relayNotificationIntents, stageNotification } from './notification-intent';

const db = createTestPrisma();
let boss: PgBoss;
beforeAll(async () => {
  boss = await createEmailQueue(process.env.DATABASE_URL_TEST!, {
    schema: 'pgboss_intent_test',
    retryDelay: 0,
  });
});
afterAll(async () => {
  if (boss) await boss.stop({ graceful: true, timeout: 5000 });
  await db.$disconnect();
});
describe('işlemsel bildirim niyeti', () => {
  it('işlem geri alınırsa niyet de yoktur', async () => {
    const user = await createUser(db),
      id = randomUUID();
    await expect(
      db.$transaction(async (tx) => {
        await stageNotification(tx, user, {
          type: 'generic',
          event: 'contact',
          eventId: id,
          path: '/hesap/iletisim',
        });
        throw new Error('geri al');
      }),
    ).rejects.toThrow('geri al');
    expect(await db.notificationIntent.count({ where: { userId: user } })).toBe(0);
  });
  it('aktarımı hesap silme ile aynı kilit sırasına sokar', async () => {
    const user = await createUser(db),
      eventId = randomUUID();
    await db.$transaction((tx) =>
      stageNotification(tx, user, {
        type: 'generic',
        event: 'contact',
        eventId,
        path: '/hesap/iletisim',
      }),
    );
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    const relay = relayNotificationIntents(db, async (row) => {
      if (row.userId !== user) throw new Error('başka test');
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    const removal = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${user} FOR UPDATE`;
      await tx.notificationIntent.deleteMany({ where: { userId: user } });
    });
    release.resolve();
    const results = await Promise.allSettled([relay, removal]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await db.notificationIntent.count({ where: { userId: user } })).toBe(0);
  });
  it('kuyruk kesintisinden sonra teslim edilir; iki iş ve kuyruk sonrası tekrar tek kayıt/iş üretir', async () => {
    const user = await createUser(db),
      id = randomUUID(),
      key = `contact.requested:${id}`;
    await db.$transaction((tx) =>
      stageNotification(tx, user, {
        type: 'generic',
        event: 'contact',
        eventId: id,
        path: '/hesap/iletisim',
      }),
    );
    const broken = vi.fn(async () => {
      throw new Error('queue down');
    });
    expect((await relayNotificationIntents(db, broken)).failed).toBeGreaterThan(0);
    expect(await db.notificationIntent.count({ where: { userId: user } })).toBe(1);
    const transport = new FakeEmailTransport(),
      service = createEmailService(createEmailOutbox(db, boss), transport, () => {});
    const sender = async (row: { userId: string }) => {
      if (row.userId !== user) throw new Error('başka test');
      await service.enqueueEmail({
        to: 'sample@example.invalid',
        subject: 'Test',
        text: 'Test',
        template: 'contact.requested',
        idempotencyKey: key,
        recipientUserId: user,
      });
    };
    // Kuyruk başarılı, ama niyet silinmeden süreç öldü: sonraki koşu aynı anahtarla devam eder.
    const source = await db.notificationIntent.findFirstOrThrow({ where: { userId: user } });
    await sender(source);
    const retry = { now: () => new Date(Date.now() + 60_000) };
    await Promise.all([
      relayNotificationIntents(db, sender, retry),
      relayNotificationIntents(db, sender, retry),
    ]);
    expect(await db.notificationIntent.count({ where: { userId: user } })).toBe(0);
    expect(await db.emailLog.count({ where: { idempotencyKey: key } })).toBe(1);
    const jobs = await boss.findJobs(EMAIL_QUEUE, { data: { idempotencyKey: key } });
    expect(jobs).toHaveLength(1);
    await startEmailConsumer(boss, service.deliver);
    for (let attempt = 0; attempt < 100 && !transport.sent.length; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(transport.sent).toHaveLength(1);
  });
});

describe('niyet aktarımı: günlük (job.unexpected)', () => {
  const stage = async () => {
    const user = await createUser(db);
    await db.$transaction((tx) =>
      stageNotification(tx, user, {
        type: 'generic',
        event: 'contact',
        eventId: randomUUID(),
        path: '/hesap/iletisim',
      }),
    );
    return user;
  };

  it('yönetilen yeniden deneme: gönderim hatası `job.unexpected` yazmaz; niyet yeniden denenmek üzere kalır', async () => {
    const user = await stage();
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const broken = async (row: { userId: string }) => {
        if (row.userId !== user) return;
        throw Object.assign(new Error('kuyruk çöktü ayse@ogr.iu.edu.tr postgres://gizli'), {
          code: 'P2034',
        });
      };
      expect((await relayNotificationIntents(db, broken)).failed).toBeGreaterThan(0);
      expect(write.mock.calls.map(([line]) => String(line)).join('')).not.toContain(
        'job.unexpected',
      );
      expect(await db.notificationIntent.count({ where: { userId: user } })).toBe(1);
    } finally {
      write.mockRestore();
    }
  });

  it('aktarım işleminin kendi hatası TUR başına tek satır yazar (olay, kaynak, hata sınıfı, kod), kayıt sayısı kadar değil; ileti, adres ve kimlik yazılmaz', async () => {
    await Promise.all([stage(), stage(), stage()]);
    const brokenDb = new Proxy(db, {
      get(target, prop) {
        if (prop === '$transaction')
          return async () => {
            throw Object.assign(new Error('işlem çöktü ayse@ogr.iu.edu.tr postgres://gizli'), {
              code: 'P2034',
            });
          };
        const value: unknown = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      // Üç kayıt da başarısız sayılır (aynı hata üç kez oluşur), ama günlüğe tek satır düşer.
      expect(
        (await relayNotificationIntents(brokenDb, async () => undefined)).failed,
      ).toBeGreaterThanOrEqual(3);
      const lines = write.mock.calls.map(([line]) => String(line));
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0]!.trim())).toEqual({
        event: 'job.unexpected',
        source: 'notification.relay',
        errorName: 'Error',
        errorCode: 'P2034',
      });
      expect(lines.join('')).not.toMatch(/ayse|postgres|gizli|işlem çöktü/);
    } finally {
      write.mockRestore();
    }
  });
});
