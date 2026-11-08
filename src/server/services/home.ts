import 'server-only';

import { homeSummarySchema, type HomeSummary } from '@/contracts/home';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedNotFound } from '@/lib/errors';

import { getAdminOverview } from './admin-panel';

/**
 * Ana sayfa panosu sayıları. Hepsi oturumdaki kullanıcının KENDİ kayıtlarıdır (başkasının verisi/kimliği yok);
 * yönetici sayısı `getAdminOverview`'un yetki yeniden yüklemesi ve kapsam kesişimiyle gelir. Hata vermez: yönetici yetkisi
 * yoksa `adminPending` boş (`null`) kalır.
 */
export async function getHomeSummary(
  deps: { db: PrismaClient; now?: () => Date },
  userId: string,
): Promise<HomeSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const { db } = deps;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      deletedAt: true,
      memberships: {
        where: { endedAt: null, verificationStatus: 'VERIFIED' },
        select: { role: true },
      },
    },
  });
  if (!user || user.deletedAt) throw codedNotFound('RESOURCE_NOT_FOUND');
  const [
    contactRequests,
    cvReviewsToAnswer,
    cvReviewsToRate,
    appointmentRequests,
    feedbackForms,
    adminPending,
  ] = await Promise.all([
    db.contactRequest.count({ where: { targetId: userId, status: 'PENDING' } }),
    db.cvReviewRequest.count({
      where: { mentorId: userId, status: 'OPEN', expiresAt: { gt: now } },
    }),
    db.cvReviewRequest.count({
      where: { studentId: userId, status: 'COMPLETED', helpfulAt: null },
    }),
    // Yalnız SAYI gerekir: `feedbackOverview` listesi en çok 50 satır ve her talep için güvenilirlik sorgusu yapar;
    // ana sayfada kullanılırsa sayı 50'de kesilir ve her açılışta gereksiz sorgu üretir.
    db.appointment.count({ where: { mentorId: userId, status: 'REQUESTED' } }),
    db.appointment.count({
      where: {
        OR: [{ mentorId: userId }, { menteeId: userId }],
        status: { in: ['CONFIRMED', 'NO_SHOW'] },
        endsAt: { lte: new Date(now.getTime() - 60 * 60 * 1000) },
        feedbacks: { none: { authorId: userId } },
      },
    }),
    getAdminOverview({ db, now: () => now }, userId)
      .then(
        ({ counts }) =>
          counts.pendingExperiences + counts.openReports + counts.pendingGraduationDocuments,
      )
      .catch(() => null),
  ]);
  return homeSummarySchema.parse({
    firstName: user.name.trim().split(/\s+/)[0] ?? '',
    role: user.memberships.some((m) => m.role === 'STUDENT') ? 'STUDENT' : 'MENTOR',
    pending: {
      contactRequests,
      cvReviewsToAnswer,
      cvReviewsToRate,
      feedbackForms,
      appointmentRequests,
    },
    adminPending,
  });
}
