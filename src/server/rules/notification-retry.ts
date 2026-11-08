/** Outbox aktarımı: beş başarısız deneme; araları 1, 2, 4, 8 dakika. Kalıcı hata yeniden denenmez. */
export const NOTIFICATION_INTENT_MAX_ATTEMPTS = 5;

export function notificationRetry(attemptCount: number, now: Date) {
  if (!Number.isInteger(attemptCount) || attemptCount < 1)
    throw new RangeError('Geçersiz deneme sayısı');
  return attemptCount >= NOTIFICATION_INTENT_MAX_ATTEMPTS
    ? {
        status: 'FAILED' as const,
        attemptCount,
        nextAttemptAt: null,
        failedAt: now,
        failureCode: 'RETRY_EXHAUSTED' as const,
      }
    : {
        status: 'PENDING' as const,
        attemptCount,
        nextAttemptAt: new Date(now.getTime() + 60_000 * 2 ** (attemptCount - 1)),
        failedAt: null,
        failureCode: null,
      };
}
