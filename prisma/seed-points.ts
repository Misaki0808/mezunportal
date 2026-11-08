import { DEFAULT_POINT_RULES, POINT_ACTIONS } from '../src/contracts/points';
import type { PrismaClient } from '../src/generated/prisma/client';

/**
 * Puan kuralları başlangıç tablosu (K-11). İdempotent: yalnız EKSİK eylem satırı eklenir; sistem yöneticisinin
 * değiştirdiği değer yeniden koşuda ezilmez.
 */
export async function seedPointRules(prisma: PrismaClient) {
  await prisma.pointRule.createMany({
    data: POINT_ACTIONS.map((action) => ({ action, ...DEFAULT_POINT_RULES[action] })),
    skipDuplicates: true,
  });
}
