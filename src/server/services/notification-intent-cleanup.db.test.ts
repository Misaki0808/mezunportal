import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@/generated/prisma/client';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';
import { purgeFailedNotificationIntents } from './notification-intent-cleanup';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

describe('kalıcı bildirim hatalarının saklama süresi', () => {
  it('yalnız failedAt üzerinden 90 günü aşan FAILED kayıtlarını siler; tekrarında sıfır döner', async () => {
    // Geçmiş sabit saat, diğer dosyaların güncel bildirim niyetlerine dokunmaz.
    const now = new Date('2000-07-01T12:00:00Z');
    const day = 24 * 60 * 60 * 1000;
    const cutoff = now.getTime() - 90 * day;
    const userId = await createUser(db);
    const cases = [
      { status: 'FAILED', failedAt: new Date(now.getTime() - 91 * day), removed: true },
      { status: 'FAILED', failedAt: new Date(cutoff - 1), removed: true },
      { status: 'FAILED', failedAt: new Date(cutoff), removed: false },
      { status: 'FAILED', failedAt: new Date(cutoff + 1), removed: false },
      { status: 'FAILED', failedAt: new Date(now.getTime() - 89 * day), removed: false },
      { status: 'FAILED', failedAt: new Date(now.getTime() + day), removed: false },
      { status: 'PENDING', failedAt: null, removed: false },
    ] as const;
    const rows = [];
    for (const entry of cases) {
      rows.push(
        await db.notificationIntent.create({
          data: {
            key: `cleanup:${randomUUID()}`,
            userId,
            kind: 'generic',
            payload: entry.status === 'FAILED' ? Prisma.JsonNull : {},
            status: entry.status,
            failedAt: entry.failedAt,
            attemptCount: entry.status === 'FAILED' ? 5 : 0,
            nextAttemptAt: entry.status === 'FAILED' ? null : now,
            failureCode: entry.status === 'FAILED' ? 'RETRY_EXHAUSTED' : null,
            // Eski oluşturulma zamanı yeni hatayı silmek için yeterli değildir.
            createdAt: new Date(now.getTime() - 180 * day),
          },
        }),
      );
    }
    // Başarılı teslim niyeti silinir; SENT durumu EmailLog'dadır, ona dokunulmaz.
    const sent = await db.emailLog.create({
      data: {
        idempotencyKey: `cleanup:${randomUUID()}`,
        template: 'test',
        recipientUserId: userId,
        status: 'SENT',
        sentAt: new Date(now.getTime() - 180 * day),
        createdAt: new Date(now.getTime() - 180 * day),
      },
    });
    // Bugünkü DB kısıtı failedAt'ı yalnız FAILED için doldurtur. Durum filtresi bu yüzden
    // veride eşdeğer görünse de silme kapsamının açık bekçisi olmalıdır (gelecekteki durumlar).
    const deletion = vi.spyOn(db.notificationIntent, 'deleteMany');
    try {
      expect(await purgeFailedNotificationIntents(db, now)).toBe(2);
      expect(deletion).toHaveBeenCalledTimes(1);
      expect(deletion).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'FAILED' }) }),
      );
    } finally {
      deletion.mockRestore();
    }
    const remaining = await db.notificationIntent.findMany({
      where: { userId },
      orderBy: { key: 'asc' },
    });
    expect(remaining).toEqual(
      rows.filter((_, index) => !cases[index]!.removed).sort((a, b) => a.key.localeCompare(b.key)),
    );
    expect(await purgeFailedNotificationIntents(db, now)).toBe(0);
    expect(await db.emailLog.findUnique({ where: { id: sent.id } })).toEqual(sent);
    expect(await db.user.count({ where: { id: userId } })).toBe(1);
  });
});
