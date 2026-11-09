import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { digestUnsubscribeSubject } from '../rules/digest-unsubscribe';

/** Rıza kapısı istisnası: e-posta tercihini kapatmak giriş veya zorunlu onay gerektirmez. */
export async function unsubscribeMonthlyDigest(db: PrismaClient, token: string, secret: string) {
  const userId = digestUnsubscribeSubject(token, secret);
  if (!userId) return;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR UPDATE`;
    const user = await tx.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) return;
    await tx.notificationPreference.upsert({
      where: { userId_type: { userId, type: 'MONTHLY_DIGEST' } },
      create: { userId, type: 'MONTHLY_DIGEST', enabled: false },
      update: { enabled: false },
    });
  });
}
