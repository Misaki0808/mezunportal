import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';

import { monthRange } from '../rules/appointmentSlots';

/**
 * Mentorların BU TAKVİM AYINDA (İstanbul) kapasite harcayan randevu sayısı. Kapasiteyi onaylı, tamamlanmış ve
 * katılımsız randevular harcar; bekleyen, reddedilen, iptal ve süresi dolan talepler harcamaz. Dizin servisi
 * (`mentor-directory`) ve randevu onayı aynı tanımı kullanır.
 */
export type ApprovedCounts = (
  db: Pick<PrismaClient, 'appointment'>,
  mentorIds: readonly string[],
  now: Date,
) => Promise<Map<string, number>>;

export const CAPACITY_STATUSES = ['CONFIRMED', 'COMPLETED', 'NO_SHOW'] as const;

export const approvedCountsThisMonth: ApprovedCounts = async (db, mentorIds, now) => {
  if (mentorIds.length === 0) return new Map();
  const { from, to } = monthRange(now);
  const groups = await db.appointment.groupBy({
    by: ['mentorId'],
    where: {
      mentorId: { in: [...mentorIds] },
      status: { in: [...CAPACITY_STATUSES] },
      startsAt: { gte: from, lt: to },
    },
    _count: { _all: true },
  });
  return new Map(groups.map((group) => [group.mentorId, group._count._all]));
};
