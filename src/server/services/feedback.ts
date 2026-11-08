import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { feedbackInputSchema, type FeedbackInput, type FeedbackView } from '@/contracts/feedback';
import { codedConflict, codedNotFound } from '@/lib/errors';
import { createPermissions } from '../permissions/guards';
import { reliability, reliabilitySince } from '../rules/reliability';
import { requireConsent } from './privacy';

const HOUR = 60 * 60 * 1000;
export async function submitFeedback(
  db: PrismaClient,
  userId: string,
  input: FeedbackInput,
  now = new Date(),
) {
  const parsed = feedbackInputSchema.parse(input);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR SHARE`;
    await createPermissions({
      db: () => tx,
      getSessionUserId: async () => userId,
      now: () => now,
    }).requireVerifiedMember();
    await requireConsent(tx, userId);
    await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id"=${parsed.appointmentId} FOR UPDATE`;
    const row = await tx.appointment.findUnique({
      where: { id: parsed.appointmentId },
      include: { feedbacks: true },
    });
    if (!row || (row.mentorId !== userId && row.menteeId !== userId))
      throw codedNotFound('RESOURCE_NOT_FOUND');
    if (row.feedbacks.some((f) => f.authorId === userId))
      throw codedConflict('FEEDBACK_ALREADY_SUBMITTED');
    if (
      !['CONFIRMED', 'NO_SHOW'].includes(row.status) ||
      row.endsAt.getTime() + HOUR > now.getTime()
    )
      throw codedConflict('FEEDBACK_NOT_READY');
    await tx.sessionFeedback.create({ data: { ...parsed, authorId: userId } });
    if (userId === row.mentorId && !parsed.happened) {
      await tx.appointment.update({ where: { id: row.id }, data: { status: 'NO_SHOW' } });
    } else if (
      row.status === 'CONFIRMED' &&
      parsed.happened &&
      row.feedbacks.some((f) => f.authorId !== userId && f.happened)
    ) {
      await tx.appointment.update({ where: { id: row.id }, data: { status: 'COMPLETED' } });
    }
    return { submitted: true };
  });
}
export async function feedbackView(
  db: PrismaClient,
  userId: string,
  appointmentId: string,
  now = new Date(),
): Promise<FeedbackView> {
  const row = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      mentor: { select: { name: true } },
      mentee: { select: { name: true } },
      feedbacks: { where: { authorId: userId }, select: { id: true } },
    },
  });
  if (!row || (row.mentorId !== userId && row.menteeId !== userId))
    throw codedNotFound('RESOURCE_NOT_FOUND');
  if (
    !['CONFIRMED', 'COMPLETED', 'NO_SHOW'].includes(row.status) ||
    row.endsAt.getTime() + HOUR > now.getTime()
  )
    throw codedConflict('FEEDBACK_NOT_READY');
  const role = row.mentorId === userId ? 'MENTOR' : 'MENTEE';
  return {
    appointmentId: row.id,
    role,
    counterpartName: role === 'MENTOR' ? row.mentee.name : row.mentor.name,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    submitted: row.feedbacks.length > 0,
  };
}
/** Yalnız öğrenci kendisi veya bu öğrenciden talep alan mentor çağırır. */
export async function studentReliability(
  db: PrismaClient,
  viewerId: string,
  studentId: string,
  now = new Date(),
) {
  if (viewerId !== studentId) {
    const relation = await db.appointment.findFirst({
      where: { mentorId: viewerId, menteeId: studentId, status: 'REQUESTED' },
      select: { id: true },
    });
    if (!relation) throw codedNotFound('RESOURCE_NOT_FOUND');
  }
  const rows = await db.appointment.groupBy({
    by: ['status'],
    where: {
      menteeId: studentId,
      status: { in: ['COMPLETED', 'NO_SHOW'] },
      endsAt: { gte: reliabilitySince(now), lte: now },
    },
    _count: { _all: true },
  });
  return reliability(
    rows.find((row) => row.status === 'COMPLETED')?._count._all ?? 0,
    rows.find((row) => row.status === 'NO_SHOW')?._count._all ?? 0,
  );
}

export async function feedbackOverview(db: PrismaClient, userId: string, now = new Date()) {
  const rows = await db.appointment.findMany({
    where: {
      OR: [
        { mentorId: userId, status: 'REQUESTED' },
        {
          OR: [{ mentorId: userId }, { menteeId: userId }],
          status: { in: ['CONFIRMED', 'NO_SHOW'] },
          endsAt: { lte: new Date(now.getTime() - HOUR) },
          feedbacks: { none: { authorId: userId } },
        },
      ],
    },
    orderBy: { startsAt: 'desc' },
    take: 50,
    select: {
      id: true,
      mentorId: true,
      menteeId: true,
      status: true,
      startsAt: true,
      mentor: { select: { name: true } },
      mentee: { select: { name: true } },
    },
  });
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      startsAt: row.startsAt,
      name: row.mentorId === userId ? row.mentee.name : row.mentor.name,
      kind: row.status === 'REQUESTED' ? ('REQUEST' as const) : ('FEEDBACK' as const),
      reliability:
        row.status === 'REQUESTED' && row.mentorId === userId
          ? await studentReliability(db, userId, row.menteeId, now)
          : null,
    })),
  );
}
