import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock('./email', () => ({ enqueueEmail: mocks.enqueue }));
vi.mock('@/lib/env', () => ({ getAuthEnv: () => ({ APP_URL: 'https://example.org' }) }));
import { sendNotificationIntent } from './notification-intent-worker';

const payload = { type: 'jobMatch', event: 'digest', day: '2026-11-07' };
function database(
  options: { recent?: number; existing?: boolean; enabled?: boolean; active?: number } = {},
) {
  const tx = {
    $queryRaw: vi.fn(),
    user: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ email: 'student@example.org', deletedAt: null, banned: false }),
    },
    notificationPreference: {
      findUnique: vi.fn().mockResolvedValue({ enabled: options.enabled ?? true }),
    },
    jobMatch: { count: vi.fn().mockResolvedValue(options.active ?? 1) },
    jobMatchDigest: {
      findUnique: vi.fn().mockResolvedValue(options.existing ? {} : null),
      count: vi.fn().mockResolvedValue(options.recent ?? 0),
      create: vi.fn(),
    },
  };
  return { tx, db: { $transaction: async (fn: (tx: typeof tx) => Promise<void>) => fn(tx) } };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enqueue.mockResolvedValue({ emailLogId: 'log' });
});
describe('ilan özeti', () => {
  it('açık eşleşmede tek e-posta kuyruğa alır ve günlük hakkı kaydeder', async () => {
    const { db, tx } = database();
    await sendNotificationIntent(db as never, { id: 'intent', userId: 'student', payload });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(tx.jobMatchDigest.create).toHaveBeenCalledTimes(1);
  });
  it.each([{ enabled: false }, { active: 0 }, { existing: true }, { recent: 3 }])(
    'kapalı tercih, geçersiz ilan veya sıklık sınırında göndermez: %o',
    async (options) => {
      const { db, tx } = database(options);
      await sendNotificationIntent(db as never, { id: 'intent', userId: 'student', payload });
      expect(mocks.enqueue).not.toHaveBeenCalled();
      expect(tx.jobMatchDigest.create).not.toHaveBeenCalled();
    },
  );
  it('haftalık üçüncü özet mümkündür', async () => {
    const { db } = database({ recent: 2 });
    await sendNotificationIntent(db as never, { id: 'intent', userId: 'student', payload });
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
  });
  it('kapı kuyruğa almazsa özet hakkı harcanmaz', async () => {
    mocks.enqueue.mockResolvedValue({ emailLogId: null });
    const { db, tx } = database();
    await sendNotificationIntent(db as never, { id: 'intent', userId: 'student', payload });
    expect(tx.jobMatchDigest.create).not.toHaveBeenCalled();
  });
});
