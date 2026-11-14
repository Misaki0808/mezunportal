import { expect, it, vi } from 'vitest';
import { codedForbidden } from '@/lib/errors';
import type { PrismaClient } from '@/generated/prisma/client';
import { relayNotificationIntents } from './notification-intent';
it('sessiz kodlu hata beklenmedik sonraki hatanın günlüğünü engellemez', async () => {
  const findMany = vi
    .fn()
    .mockResolvedValueOnce([
      { id: 'a', userId: 'a' },
      { id: 'b', userId: 'b' },
    ])
    .mockResolvedValueOnce([]);
  const tx = vi
    .fn()
    .mockRejectedValueOnce(codedForbidden('AUTH_FORBIDDEN'))
    .mockRejectedValueOnce(new Error('backend down'));
  const db = { notificationIntent: { findMany }, $transaction: tx } as unknown as PrismaClient;
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  try {
    await relayNotificationIntents(db, async () => {});
    expect(write).toHaveBeenCalledTimes(1);
  } finally {
    write.mockRestore();
  }
});
