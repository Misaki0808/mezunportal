import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';
const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  secret: 'test-secret-with-at-least-32-characters',
}));
vi.mock('./email', () => ({ enqueueEmail: mocks.enqueue }));
vi.mock('@/lib/env', () => ({
  getAuthEnv: () => ({ BETTER_AUTH_SECRET: mocks.secret, APP_URL: 'http://localhost:3000' }),
}));
import { stagePilotInvitation } from '../services/notification-intent';
import { sendNotificationIntent } from './notification-intent-worker';

describe('davet niyeti aktarımı', () => {
  it('kesinti sonrası aynı kimlikle yeniden kuyruklar ve adresi yalnız göndermede açar', async () => {
    let payload: Prisma.JsonValue = null;
    const tx = {
      notificationIntent: {
        createMany: async (args: { data: { payload: Prisma.JsonValue }[] }) => {
          payload = args.data[0]!.payload;
          return { count: 1 };
        },
      },
    };
    await stagePilotInvitation(tx as never, 'actor', 'sample@example.invalid', mocks.secret);
    const row = { id: 'row', userId: 'actor', payload };
    mocks.enqueue
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValue({ emailLogId: 'queued' });
    await expect(sendNotificationIntent({} as never, row)).rejects.toThrow();
    await sendNotificationIntent({} as never, row);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    const first = mocks.enqueue.mock.calls[0]![0];
    const second = mocks.enqueue.mock.calls[1]![0];
    expect(first.to).toBe('sample@example.invalid');
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(JSON.stringify(row)).not.toContain('sample@example.invalid');
    expect(first.template).toBe('pilot.invitation');
  });
});
