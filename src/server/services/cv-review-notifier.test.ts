import { describe, expect, it, vi } from 'vitest';
import { notificationTypeForTemplate } from '../rules/notification';
const mocks = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock('../jobs/email', () => ({ enqueueEmail: mocks.enqueue }));
vi.mock('@/lib/env', () => ({ getEnv: () => ({ APP_URL: 'http://localhost:3200' }) }));
import { createCvReviewNotifier } from './cv-review-notifier';
describe('CV inceleme bildirimleri', () => {
  it.each(['requested', 'answered', 'expired'] as const)(
    '%s şablonu tercih kapısına ve tekilleştirmeye bağlı',
    async (event) => {
      mocks.enqueue.mockClear();
      const db = { user: { findUnique: async () => ({ email: 'test@example.invalid' }) } };
      const notify = createCvReviewNotifier(db as never);
      await notify('person', event, 'request');
      expect(notificationTypeForTemplate(`cv.review.${event}`)).toBe('CV_REVIEW');
      expect(mocks.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: 'person',
          template: `cv.review.${event}`,
          idempotencyKey: `cv.review.${event}:request`,
        }),
      );
      expect(JSON.stringify(mocks.enqueue.mock.calls)).not.toContain('gizli yorum');
    },
  );
});
