import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../services/cv-review-notifier', () => ({ createCvReviewNotifier: () => mocks.notify }));
import { sendNotificationIntent } from './notification-intent-worker';
beforeEach(() => vi.clearAllMocks());
const db = (request: { studentId: string; mentorId: string } | null) => ({
  cvReviewRequest: { findUnique: vi.fn().mockResolvedValue(request) },
});
it.each(['requested', 'answered', 'expired'] as const)(
  'inceleyici: %s CV niyeti yalnız talebin doğru tarafına mevcut tek kapıdan gönderilir',
  async (event) => {
    const userId = event === 'requested' ? 'mentor' : 'student';
    await sendNotificationIntent(db({ studentId: 'student', mentorId: 'mentor' }) as never, {
      id: 'intent',
      userId,
      payload: { type: 'cvReview', event, requestId: 'request' },
    });
    expect(mocks.notify).toHaveBeenCalledWith(userId, event, 'request');
  },
);
it('inceleyici: başka kişiye ait hedef veya silinmiş talep e-posta üretmez', async () => {
  for (const client of [db(null), db({ studentId: 'student', mentorId: 'mentor' })]) {
    await sendNotificationIntent(client as never, {
      id: 'intent',
      userId: 'other',
      payload: { type: 'cvReview', event: 'requested', requestId: 'request' },
    });
  }
  expect(mocks.notify).not.toHaveBeenCalled();
});
it('inceleyici: niyet gövdesine kişisel not eklenemez', async () => {
  await expect(
    sendNotificationIntent(db(null) as never, {
      id: 'intent',
      userId: 'mentor',
      payload: {
        type: 'cvReview',
        event: 'requested',
        requestId: 'request',
        note: 'Kaydedilmemesi gereken not',
      },
    }),
  ).rejects.toThrow();
  expect(mocks.notify).not.toHaveBeenCalled();
});
