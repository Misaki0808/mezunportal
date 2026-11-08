import { afterAll, describe, expect, it, vi } from 'vitest';

import { Prisma } from '@/generated/prisma/client';
import { createTestPrisma } from '@/test/db';
import { createUser } from '@/test/fixtures';

import { deleteAccount } from './accountDeletion';
import {
  notificationIntentPayload,
  openPilotInvitation,
  relayNotificationIntents,
  stageNotification,
  stagePilotInvitation,
} from './notification-intent';

const db = createTestPrisma();
afterAll(() => db.$disconnect());
const previousKey = 'previous-fictional-key-only-for-test';
const currentKey = 'current-fictional-key-only-for-test';

describe('TD-017 çözülemeyen bildirim niyeti', () => {
  it('anahtar değişikliği: 5 deneme, geri çekilme, yükü temizlenmiş kalıcı hata ve tek güvenli uyarı; diğer niyetler gider', async () => {
    const userId = await createUser(db);
    const address = 'rotation-test@example.invalid';
    await stagePilotInvitation(db, userId, address, previousKey);
    const original = await db.notificationIntent.findFirstOrThrow({ where: { userId } });
    let now = new Date(Date.now() + 1000);
    let badCalls = 0;
    let goodCalls = 0;
    const sender = async (row: { userId: string; payload: Prisma.JsonValue }) => {
      if (row.userId !== userId) return;
      const payload = notificationIntentPayload.parse(row.payload);
      if (payload.type !== 'pilotInvitation') throw new Error('Beklenmeyen tür');
      if (payload.invitationId === (original.payload as { invitationId: string }).invitationId)
        badCalls++;
      else goodCalls++;
      // Gerçek AES-GCM çözme: eski anahtarlı olan her seferinde hata verir.
      openPilotInvitation(payload, row.userId, currentKey);
    };
    const warning = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      for (let attempt = 1; attempt <= 5; attempt++) {
        await stagePilotInvitation(db, userId, address, currentKey);
        const result = await relayNotificationIntents(db, sender, { now: () => now });
        expect(result.failed).toBe(1);
        expect(goodCalls).toBe(attempt);
        expect(badCalls).toBe(attempt);
        const row = await db.notificationIntent.findUniqueOrThrow({ where: { id: original.id } });
        expect(row.attemptCount).toBe(attempt);
        if (attempt < 5) {
          expect(row.status).toBe('PENDING');
          expect(row.nextAttemptAt!.getTime() - now.getTime()).toBe(60_000 * 2 ** (attempt - 1));
          const before = new Date(row.nextAttemptAt!.getTime() - 1);
          await relayNotificationIntents(db, sender, { now: () => before });
          expect(badCalls).toBe(attempt);
          now = row.nextAttemptAt!;
        } else {
          expect(row).toMatchObject({
            status: 'FAILED',
            failureCode: 'RETRY_EXHAUSTED',
            payload: null,
            nextAttemptAt: null,
            failedAt: now,
          });
          // Aynı iş anahtarının tekrar sahnelenmesi FAILED kaydı canlandırmaz.
          await stageNotification(db, userId, notificationIntentPayload.parse(original.payload));
        }
      }
      await relayNotificationIntents(db, sender, {
        now: () => new Date(now.getTime() + 86400_000),
      });
      expect(badCalls).toBe(5);
      expect(warning.mock.calls).toEqual([['notification.intent: RETRY_EXHAUSTED\n']]);
      const output = JSON.stringify(warning.mock.calls);
      for (const secret of [
        userId,
        address,
        previousKey,
        currentKey,
        JSON.stringify(original.payload),
      ])
        expect(output).not.toContain(secret);
    } finally {
      warning.mockRestore();
    }
  });

  it('on eşzamanlı relay aynı hata için yalnız bir deneme tüketir', async () => {
    const userId = await createUser(db);
    await stagePilotInvitation(db, userId, 'concurrency@example.invalid', previousKey);
    const now = new Date(Date.now() + 1000);
    let calls = 0;
    const send = async (row: { userId: string }) => {
      if (row.userId === userId) {
        calls++;
        throw new Error('Sahte kalıcı hata; loglanmamalı');
      }
    };
    await Promise.all(
      Array.from({ length: 10 }, () => relayNotificationIntents(db, send, { now: () => now })),
    );
    expect(calls).toBe(1);
    expect(await db.notificationIntent.findFirstOrThrow({ where: { userId } })).toMatchObject({
      attemptCount: 1,
      status: 'PENDING',
      nextAttemptAt: new Date(now.getTime() + 60_000),
    });
  });

  it('kalıcı hata dahil bütün niyetler gerçek hesap silme işleminde silinir', async () => {
    const userId = await createUser(db);
    await stagePilotInvitation(db, userId, 'erase@example.invalid', previousKey);
    await db.notificationIntent.updateMany({
      where: { userId },
      data: {
        status: 'FAILED',
        attemptCount: 5,
        nextAttemptAt: null,
        failedAt: new Date(),
        failureCode: 'RETRY_EXHAUSTED',
        payload: Prisma.JsonNull,
      },
    });
    const { email } = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await deleteAccount(
      db,
      userId,
      { publishedContent: 'DELETE', confirmEmail: email },
      { removeStoredFiles: null },
    );
    expect(await db.notificationIntent.count({ where: { userId } })).toBe(0);
  });

  it('ham yazımda tutarsız durum ve kalıcı hatada şifreli yük reddedilir', async () => {
    const userId = await createUser(db);
    await stagePilotInvitation(db, userId, 'constraint@example.invalid', previousKey);
    for (const data of [
      { attemptCount: -1 },
      { nextAttemptAt: null },
      { status: 'FAILED' as const },
      {
        status: 'FAILED' as const,
        attemptCount: 5,
        nextAttemptAt: null,
        failedAt: new Date(),
        failureCode: null,
        payload: Prisma.JsonNull,
      },
      {
        status: 'FAILED' as const,
        attemptCount: 5,
        nextAttemptAt: null,
        failedAt: new Date(),
        failureCode: 'RETRY_EXHAUSTED',
      },
    ]) {
      await expect(db.notificationIntent.updateMany({ where: { userId }, data })).rejects.toThrow();
    }
  });
});
