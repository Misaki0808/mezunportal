import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';

/** Yükü temizlenmiş kalıcı hatalar operatör incelemesi için 90 gün saklanır. */
export async function purgeFailedNotificationIntents(db: PrismaClient, now = new Date()) {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const { count } = await db.notificationIntent.deleteMany({
    where: { status: 'FAILED', failedAt: { lt: cutoff } },
  });
  return count;
}
