import 'server-only';

import {
  INBOX_UNREAD_CAP,
  inboxPageSchema,
  markInboxReadInputSchema,
  type InboxPage,
} from '@/contracts/inbox';
import type { PrismaClient } from '@/generated/prisma/client';

import { groupInbox } from '../rules/inbox';
import { istanbulDay } from '../rules/jobPosting';

type Deps = { db: Pick<PrismaClient, 'inAppNotification'>; now?: () => Date };

/** Sayfa hedefi; günün bütünlüğü için tek günün kayıtları gerektiğinde bu sayıyı aşar. */
const PAGE_ITEMS = 100;
const dayStart = (day: string) => new Date(`${day}T00:00:00+03:00`);
const nextDay = (day: string) => new Date(dayStart(day).getTime() + 86_400_000);

/** Okunmamış sayısı (üst sınırlı): her sayfa yüklemesinde çalışır, dizinli ve ucuzdur. */
export async function countMyUnread(deps: Deps, userId: string): Promise<number> {
  const rows = await deps.db.inAppNotification.findMany({
    where: { userId, readAt: null },
    select: { id: true },
    take: INBOX_UNREAD_CAP,
  });
  return rows.length;
}

/**
 * Oturumdaki kullanıcının bildirimleri, yeniden eskiye, günlere göre sayfalanmış ve (tür + gün) gruplanmış olarak.
 * Sayfalama GÜNE göre yapılır: bir grup (aynı tür, aynı gün) iki sayfaya bölünmez, böylece "3 yeni ilan" satırı bir sonraki
 * sayfada "1 yeni ilan" olarak yinelenmez. Sorgu her zaman `userId` ile süzülür; başkasının kaydı bu yoldan okunamaz.
 */
export async function listMyInbox(
  deps: Deps,
  userId: string,
  input: { cursor?: string } = {},
): Promise<InboxPage> {
  const where = {
    userId,
    ...(input.cursor ? { createdAt: { lt: dayStart(input.cursor) } } : {}),
  };
  const select = { id: true, kind: true, refId: true, createdAt: true, readAt: true } as const;
  const orderBy = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  let rows = await deps.db.inAppNotification.findMany({
    where,
    select,
    orderBy,
    take: PAGE_ITEMS + 1,
  });
  let nextCursor: string | null = null;
  if (rows.length > PAGE_ITEMS) {
    const days = [...new Set(rows.map((row) => istanbulDay(row.createdAt)))];
    if (days.length > 1) {
      // En eski gün yarım kalmış olabilir: o gün bütünüyle bir sonraki sayfaya kalır.
      const oldest = days[days.length - 1]!;
      rows = rows.filter((row) => istanbulDay(row.createdAt) !== oldest);
      nextCursor = days[days.length - 2]!;
    } else {
      // Tek gün sayfayı aşıyor: o günü bütün oku, imleç o gündür; kalan kayıtlar atlanmaz.
      const only = days[0]!;
      rows = await deps.db.inAppNotification.findMany({
        where: { userId, createdAt: { gte: dayStart(only), lt: nextDay(only) } },
        select,
        orderBy,
      });
      nextCursor = only;
    }
  }
  return inboxPageSchema.parse({
    groups: groupInbox(rows),
    nextCursor,
    unread: await countMyUnread(deps, userId),
  });
}

/** Yalnız çağıranın okunmamış kayıtlarını işaretler; başkasına ait kimlik sessizce yok sayılır (sayıya girmez). */
export async function markInboxRead(
  deps: Deps,
  userId: string,
  input: unknown,
): Promise<{ marked: number }> {
  const { ids } = markInboxReadInputSchema.parse(input);
  const now = (deps.now ?? (() => new Date()))();
  const result = await deps.db.inAppNotification.updateMany({
    where: { id: { in: ids }, userId, readAt: null },
    data: { readAt: now },
  });
  return { marked: result.count };
}

export async function markAllInboxRead(deps: Deps, userId: string): Promise<{ marked: number }> {
  const now = (deps.now ?? (() => new Date()))();
  const result = await deps.db.inAppNotification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now },
  });
  return { marked: result.count };
}
