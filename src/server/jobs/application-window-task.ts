import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { applicationWindowCycle } from '../rules/application-window';
import { hasCurrentApplicationWindow } from '../services/application-window';
import { stageNotification } from '../services/notification-intent';

/** Ay başında kullanıcı başına tek idempotent niyet; gönderimde takip ve eşik tekrar hesaplanır. */
export async function scheduleApplicationWindows(db: PrismaClient, now = new Date()) {
  const cycle = applicationWindowCycle(now);
  if (!cycle) return 0;
  const followers = await db.companyFollow.findMany({
    distinct: ['userId'],
    select: { userId: true },
    orderBy: { userId: 'asc' },
  });
  let staged = 0;
  for (const { userId } of followers) {
    if (!(await hasCurrentApplicationWindow(db, userId, cycle, now))) continue;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR KEY SHARE`;
      const active = await tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      });
      if (!active || !(await tx.companyFollow.count({ where: { userId } }))) return;
      await stageNotification(tx, userId, { type: 'applicationWindow', event: 'reminder', cycle });
    });
    staged++;
  }
  return staged;
}
