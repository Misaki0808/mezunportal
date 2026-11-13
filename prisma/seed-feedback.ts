import type { PrismaClient } from '../src/generated/prisma/client';
import { seedUserId } from './seed-accounts';
import { seedId, seedTime } from './seed-util';

/** Eski, sentetik ve tamamlanmış tek görüşme; kullanıcının son 12 ay göstergesini etkilemez. */
export async function seedFeedback(prisma: PrismaClient) {
  const id = seedId('appointment', 'feedback-example');
  const mentorId = seedUserId('alumniMentor');
  const menteeId = seedUserId('student');
  // 365 gün önce, UTC 08:00 = İstanbul 11:00 (UTC+3 sabit): deneme turunda "gece 03:00 görüşme" gibi tuhaf durmasın.
  const base = seedTime(-365 * 24 * 60 + 8 * 60);
  const later = (minutes: number) => new Date(base.getTime() + minutes * 60_000);
  await prisma.appointment.upsert({
    where: { id },
    create: {
      id,
      mentorId,
      menteeId,
      startsAt: base,
      endsAt: later(30),
      expiresAt: later(-1440),
      decidedAt: later(-1440),
      status: 'COMPLETED',
      mode: 'ONLINE',
      createdAt: later(-2880),
    },
    update: {},
  });
  for (const authorId of [mentorId, menteeId]) {
    await prisma.sessionFeedback.upsert({
      where: { appointmentId_authorId: { appointmentId: id, authorId } },
      create: {
        id: seedId('feedback', authorId),
        appointmentId: id,
        authorId,
        happened: true,
        helpful: true,
        createdAt: later(120),
      },
      update: {},
    });
  }
}
