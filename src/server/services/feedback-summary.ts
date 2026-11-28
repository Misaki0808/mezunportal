import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { codedNotFound } from '@/lib/errors';
import {
  mentorRating,
  studentFeedbackSummary,
  type StudentFeedback,
} from '../rules/feedback-summary';

/** Dizinin kendi kapsam süzgecinden geçmiş mentorları için yalnız eşik üstü toplam. */
export async function mentorRatings(db: PrismaClient, mentorIds: readonly string[]) {
  if (!mentorIds.length) return new Map<string, NonNullable<ReturnType<typeof mentorRating>>>();
  const rows = await db.sessionFeedback.findMany({
    where: {
      happened: true,
      ratingHalf: { not: null },
      appointment: { status: 'COMPLETED', mentorId: { in: [...mentorIds] } },
    },
    select: {
      authorId: true,
      ratingHalf: true,
      appointment: { select: { mentorId: true, menteeId: true } },
    },
  });
  const values = new Map<string, { studentId: string; ratingHalf: number }[]>();
  for (const row of rows) {
    if (row.authorId !== row.appointment.menteeId || row.ratingHalf === null) continue;
    const list = values.get(row.appointment.mentorId) ?? [];
    list.push({ studentId: row.appointment.menteeId, ratingHalf: row.ratingHalf });
    values.set(row.appointment.mentorId, list);
  }
  const result = new Map<string, NonNullable<ReturnType<typeof mentorRating>>>();
  for (const [id, ratings] of values) {
    const summary = mentorRating(ratings);
    if (summary) result.set(id, summary);
  }
  return result;
}

/** Yalnız bu öğrenciden bekleyen talep alan mentor; bireysel cevaplar bu servisten çıkmaz. */
export async function requestedStudentSummary(
  db: Pick<PrismaClient, 'appointment' | 'sessionFeedback'>,
  viewerId: string,
  studentId: string,
) {
  const request = await db.appointment.findFirst({
    where: { mentorId: viewerId, menteeId: studentId, status: 'REQUESTED' },
    select: { id: true },
  });
  if (!request) throw codedNotFound('RESOURCE_NOT_FOUND');
  const rows = await db.sessionFeedback.findMany({
    where: {
      happened: true,
      appointment: {
        menteeId: studentId,
        status: 'COMPLETED',
        mentee: {
          deletedAt: null,
          menteeAppointments: { some: { mentorId: viewerId, status: 'REQUESTED' } },
        },
      },
    },
    select: {
      authorId: true,
      answerOne: true,
      answerTwo: true,
      answerThree: true,
      appointment: { select: { mentorId: true } },
    },
  });
  const eligible: StudentFeedback[] = [];
  for (const row of rows) {
    if (
      row.authorId !== row.appointment.mentorId ||
      !row.answerOne ||
      !row.answerTwo ||
      !row.answerThree
    )
      continue;
    eligible.push({
      mentorId: row.appointment.mentorId,
      answerOne: row.answerOne,
      answerTwo: row.answerTwo,
      answerThree: row.answerThree,
    });
  }
  return studentFeedbackSummary(eligible, viewerId);
}
