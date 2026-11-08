import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { consumeStillThere, stillThereToken } from './still-there';

describe('çalışma bilgisi bağlantısı', () => {
  it('seçim değişimini reddeder ve yalnız bir kez tüketir', async () => {
    let used = false;
    const tx = {
      notificationAction: {
        updateMany: vi.fn(async () => {
          if (used) return { count: 0 };
          used = true;
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => ({ userId: 'user' })),
      },
      profile: { updateMany: vi.fn(async () => ({ count: 1 })) },
    };
    const db = {
      $transaction: async (fn: (db: typeof tx) => unknown) => fn(tx),
    } as unknown as PrismaClient;
    const token = stillThereToken('action', 'YES', 'test-secret');
    expect(await consumeStillThere(db, { token, choice: 'NO' }, 'test-secret')).toBeNull();
    expect(tx.notificationAction.updateMany).not.toHaveBeenCalled();
    expect(await consumeStillThere(db, { token, choice: 'YES' }, 'test-secret')).toBe('YES');
    expect(await consumeStillThere(db, { token, choice: 'YES' }, 'test-secret')).toBeNull();
    expect(tx.notificationAction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usedAt: null, expiresAt: { gt: expect.any(Date) } }),
      }),
    );
  });
});
