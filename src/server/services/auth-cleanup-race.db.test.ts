import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';

import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

import { purgeExpiredAuth } from './auth-cleanup';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

/**
 * Değişmez: yenileme işlemi satırın kilidini tutarken temizleyici o satırı silemez (DELETE kilitte BEKLER) ve kilit
 * bırakılınca yenilenen satır kalır.
 *
 * Bekleme olay sırasına bağlıdır, duvar saatine değil: temizleyici DELETE'e ne zaman varırsa varsın döngü `waiting`
 * görünene ya da temizleyici sonuçlanana kadar sürer. Temizleyici kilit bırakılmadan SONUÇLANIRSA kilidi beklemedi
 * (atladı ya da koşulsuz sildi) demektir: gerçek kusur, test kırmızı. Süre sınırını yalnız Vitest testinin zaman aşımı verir.
 * Kesim anı epoch'a yakın seçilir: temizleyici yalnız bu testin satırını süresi dolmuş sayar. (Eskiden 2036'ydı: aynı veritabanında
 * önceki test dosyalarının bıraktığı bütün oturumlar da süresi dolmuş sayılıyor, `batchSize` 1 ile tek tek siliniyordu; kilitli
 * satıra varış süresi o satır sayısıyla ve yükle büyüyordu.)
 */
it.each(['Session', 'Verification'] as const)(
  'inceleyici: %s yenilemesi kilidi tutarken temizleyici aktif kaydı silemez',
  async (model) => {
    const now = new Date('1970-01-02T00:00:00Z');
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
    let outcome: { error?: unknown } | undefined;
    let cleanup: Promise<unknown> | undefined;
    try {
      await locked.promise;
      cleanup = purgeExpiredAuth(db, now, 1).then(
        () => void (outcome = {}),
        (error: unknown) => void (outcome = { error }),
      );
      let waiting = false;
      while (!waiting && !outcome) {
        const [state] = await db.$queryRaw<{ waiting: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
            AND query LIKE ${`DELETE%${model}%`}
        ) AS waiting`;
        waiting = state!.waiting;
        if (!waiting && !outcome) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(
        outcome,
        'temizleyici kilit bırakılmadan sonuçlandı: kilidi beklemedi',
      ).toBeUndefined();
      expect(waiting).toBe(true);
    } finally {
      release.resolve();
      await renewal;
      await cleanup;
    }
    expect(outcome?.error).toBeUndefined();
    const surviving =
      model === 'Session'
        ? await db.session.findUnique({ where: { id: row.id } })
        : await db.verification.findUnique({ where: { id: row.id } });
    expect(surviving?.expiresAt).toEqual(future);
  },
);
