import 'server-only';

import type { PrismaClient } from '@/generated/prisma/client';

/**
 * Mentorların BU TAKVİM AYINDA onaylı randevu sayısı (kapasite doluluğu). Randevu tablosu P1-10'da gelir; o zamana
 * kadar hiçbir mentor için onaylı randevu yoktur, sayaç 0 döner. P1-10 bu işlevi gerçek sayımla değiştirir
 * (`MentorDirectoryDeps.approvedCounts` ile enjekte edilir; dizin servisi ve testleri ona bağlıdır).
 */
export type ApprovedCounts = (
  db: PrismaClient,
  mentorIds: readonly string[],
  now: Date,
) => Promise<Map<string, number>>;

export const approvedCountsThisMonth: ApprovedCounts = async () => new Map();
