import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { isCodedError } from '@/lib/errors';
import { istanbulDay } from '../rules/jobPosting';
import { buildMonthlyDigest, nextMonthlyDigestKey } from '../services/monthly-digest';
import { stageNotification } from '../services/notification-intent';

/** Ay başındaki tekrarlar aynı alıcı ve aya yalnız bir e-posta üretebilir. */
export async function scheduleMonthlyDigests(
  db: PrismaClient,
  now = new Date(),
  onlyUserId?: string,
) {
  // Kota doluysa ayın ilk haftasında tekrar dene; kalıcı e-posta anahtarı ikinci gönderimi önler.
  const day = istanbulDay(now);
  if (Number(day.slice(8)) > 7) return;
  const cycle = day.slice(0, 7);
  let after = '';
  for (;;) {
    const users = await db.user.findMany({
      where: { id: { gt: after, ...(onlyUserId ? { equals: onlyUserId } : {}) }, deletedAt: null },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 100,
    });
    if (!users.length) break;
    for (const { id } of users) {
      try {
        // Ay için sıradaki anahtar yoksa (gitti, kuyrukta, başka nedenle düştü ya da bayat yeniden üretim hakkı bitti) atla.
        if (!(await nextMonthlyDigestKey(db, id, cycle))) continue;
        const preference = await db.notificationPreference.findUnique({
          where: { userId_type: { userId: id, type: 'MONTHLY_DIGEST' } },
          select: { enabled: true },
        });
        if (preference?.enabled === false || !(await buildMonthlyDigest(db, id, now))) continue;
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id} FOR KEY SHARE`;
          if (!(await tx.user.findFirst({ where: { id, deletedAt: null }, select: { id: true } })))
            return;
          await stageNotification(tx, id, { type: 'monthlyDigest', event: 'summary', cycle });
        });
      } catch (error) {
        if (!isCodedError(error)) throw error;
      }
    }
    after = users[users.length - 1]!.id;
  }
}
