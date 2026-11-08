import { describe, expect, it } from 'vitest';

import { notificationRetry } from './notification-retry';

describe('bildirim niyeti sınırlı tekrar kuralı', () => {
  const now = new Date('2030-01-01T00:00:00Z');
  it.each([1, 2, 3, 4])('%i başarısız denemeden sonra üstel bekler', (attempt) => {
    expect(notificationRetry(attempt, now)).toEqual({
      status: 'PENDING',
      attemptCount: attempt,
      nextAttemptAt: new Date(now.getTime() + 60_000 * 2 ** (attempt - 1)),
      failedAt: null,
      failureCode: null,
    });
  });
  it('beşinci denemede ve sonrasında yalnız kalıcı hata vardır', () => {
    for (const attempt of [5, 6])
      expect(notificationRetry(attempt, now)).toEqual({
        status: 'FAILED',
        attemptCount: attempt,
        nextAttemptAt: null,
        failedAt: now,
        failureCode: 'RETRY_EXHAUSTED',
      });
  });
  it.each([0, -1, 0.5, NaN, Infinity])('geçersiz sayıyı reddeder: %s', (attempt) => {
    expect(() => notificationRetry(attempt, now)).toThrow(RangeError);
  });
});
