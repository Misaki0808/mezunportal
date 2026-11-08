import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

import { purgeExpiredAuth } from './auth-cleanup';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

it.each(['Session', 'Verification'] as const)(
  'inceleyici: %s yenilemesi kilidi tutarken temizleyici aktif kaydı silemez',
  async (model) => {
    const now = new Date('2036-01-01T00:00:00Z');
    const expired = new Date(now.getTime() - 1);
    const future = new Date(now.getTime() + 1);
    const row =
      model === 'Session'
        ? await db.session.create({
            data: { userId: await createUser(db), token: randomUUID(), expiresAt: expired },
          })
        : await db.verification.create({
            data: { identifier: randomUUID(), value: randomUUID(), expiresAt: expired },
          });
    const locked = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const renewal = db.$transaction(
      async (tx) => {
        if (model === 'Session')
          await tx.session.update({ where: { id: row.id }, data: { expiresAt: future } });
        else await tx.verification.update({ where: { id: row.id }, data: { expiresAt: future } });
        locked.resolve();
        await release.promise;
      },
      { timeout: 10000 },
    );
    let cleanup: Promise<unknown> | undefined;
    try {
      await locked.promise;
      cleanup = purgeExpiredAuth(db, now, 1);
      const until = Date.now() + 5000;
      let waiting = false;
      do {
        const [state] = await db.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
            AND query LIKE ${`DELETE%${model}%`}
        ) AS waiting`;
        waiting = state!.waiting;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
      } while (!waiting && Date.now() < until);
      expect(waiting).toBe(true);
    } finally {
      release.resolve();
      await renewal;
      await cleanup;
    }
    const surviving =
      model === 'Session'
        ? await db.session.findUnique({ where: { id: row.id } })
        : await db.verification.findUnique({ where: { id: row.id } });
    expect(surviving?.expiresAt).toEqual(future);
  },
);
