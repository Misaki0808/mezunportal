import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { getDb } from '../db';
import { getAuthEnv } from '@/lib/env';
import messages from '../../../messages/tr.json';
import { enqueueEmail } from './email';
import { addDays, istanbulDay } from '../rules/jobPosting';
import { visibleJobPostingIds } from '../repositories/job-postings';
import { createCvReviewNotifier } from '../services/cv-review-notifier';
import {
  createAppointmentNotifier,
  type AppointmentNotice,
} from '../services/appointment-notifier';
import { sendNotification } from '../services/notification-email';
import { hasCurrentApplicationWindow } from '../services/application-window';
import {
  notificationIntentPayload,
  openPilotInvitation,
  relayNotificationIntents,
  type IntentRecord,
} from '../services/notification-intent';

export async function sendNotificationIntent(db: PrismaClient, row: IntentRecord) {
  const payload = notificationIntentPayload.parse(row.payload);
  if (payload.type === 'pilotInvitation') {
    const env = getAuthEnv();
    const address = openPilotInvitation(payload, row.userId, env.BETTER_AUTH_SECRET);
    await enqueueEmail({
      to: address,
      subject: messages.invitations.emailSubject,
      text: messages.invitations.emailBody.replace('{url}', new URL('/giris', env.APP_URL).href),
      template: 'pilot.invitation',
      idempotencyKey: `pilot-invitation:${payload.invitationId}`,
    });
    return;
  }
  if (payload.type === 'generic') {
    await sendNotification({
      userId: row.userId,
      event: payload.event,
      eventId: payload.eventId,
      path: payload.path,
    });
    return;
  }
  if (payload.type === 'jobMatch') {
    const dayStart = new Date(`${payload.day}T00:00:00+03:00`);
    const dayEnd = new Date(`${addDays(payload.day, 1)}T00:00:00+03:00`);
    const today = istanbulDay(new Date());
    await db.$transaction(async (tx) => {
      // Bir öğrencinin günlük ve yedi günlük sınırları bütün işçiler arasında serileştirilir.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`job-match:${row.userId}`}, 0))::text`;
      const user = await tx.user.findUnique({
        where: { id: row.userId },
        select: { email: true, deletedAt: true, banned: true, banExpires: true },
      });
      if (
        !user ||
        user.deletedAt ||
        (user.banned && (!user.banExpires || user.banExpires > new Date()))
      )
        return;
      const preference = await tx.notificationPreference.findUnique({
        where: { userId_type: { userId: row.userId, type: 'JOB_MATCH' } },
        select: { enabled: true },
      });
      if (preference?.enabled === false) return;
      const matches = await tx.jobMatch.findMany({
        where: {
          userId: row.userId,
          createdAt: { gte: dayStart, lt: dayEnd },
          posting: {
            targets: {
              some: {
                department: {
                  memberships: {
                    some: {
                      userId: row.userId,
                      role: 'STUDENT',
                      verificationStatus: 'VERIFIED',
                      endedAt: null,
                    },
                  },
                },
              },
            },
          },
        },
        select: { postingId: true },
      });
      if (
        !(
          await visibleJobPostingIds(
            tx,
            matches.map((match) => match.postingId),
            new Date(),
          )
        ).length
      )
        return;
      const existing = await tx.jobMatchDigest.findUnique({
        where: { userId_day: { userId: row.userId, day: today } },
      });
      if (existing) return;
      const recent = await tx.jobMatchDigest.count({
        where: { userId: row.userId, day: { gte: addDays(today, -6), lte: today } },
      });
      if (recent >= 3) return;
      const url = new URL('/hesap/bildirimler', getAuthEnv().APP_URL).href;
      const result = await enqueueEmail({
        to: user.email,
        recipientUserId: row.userId,
        template: 'jobMatch.digest',
        idempotencyKey: `job-match:${row.userId}:${today}:${payload.day}`,
        subject: messages.notifications.email.jobMatchSubject,
        text: messages.notifications.email.jobMatchText.replace('{url}', url),
      });
      if (result.emailLogId)
        await tx.jobMatchDigest.create({ data: { userId: row.userId, day: today } });
    });
    return;
  }
  if (payload.type === 'applicationWindow') {
    const now = new Date();
    if (!(await hasCurrentApplicationWindow(db, row.userId, payload.cycle, now))) return;
    const today = istanbulDay(now);
    await db.$transaction(async (tx) => {
      // İlan özetiyle aynı kullanıcı/gün kilidi ve 1/gün, 3/7 gün kotası.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`job-match:${row.userId}`}, 0))::text`;
      const user = await tx.user.findUnique({
        where: { id: row.userId },
        select: { email: true, deletedAt: true },
      });
      if (!user || user.deletedAt) return;
      if (
        await tx.jobMatchDigest.findUnique({
          where: { userId_day: { userId: row.userId, day: today } },
        })
      )
        return;
      const recent = await tx.jobMatchDigest.count({
        where: { userId: row.userId, day: { gte: addDays(today, -6), lte: today } },
      });
      if (recent >= 3) return;
      const url = new URL('/basvuru-takvimi', getAuthEnv().APP_URL).href;
      const result = await enqueueEmail({
        to: user.email,
        recipientUserId: row.userId,
        template: 'applicationWindow.reminder',
        idempotencyKey: `application-window:${row.userId}:${payload.cycle}`,
        subject: messages.notifications.email.applicationWindowSubject,
        text: messages.notifications.email.applicationWindowText.replace('{url}', url),
      });
      if (result.emailLogId)
        await tx.jobMatchDigest.create({ data: { userId: row.userId, day: today } });
    });
    return;
  }
  if (payload.type === 'cvReview') {
    const request = await db.cvReviewRequest.findUnique({
      where: { id: payload.requestId },
      select: { mentorId: true, studentId: true },
    });
    if (
      !request ||
      row.userId !== (payload.event === 'requested' ? request.mentorId : request.studentId)
    )
      return;
    await createCvReviewNotifier(db)(row.userId, payload.event, payload.requestId);
    return;
  }
  const meeting = await db.appointment.findUnique({
    where: { id: payload.appointmentId },
    select: {
      id: true,
      mentorId: true,
      menteeId: true,
      startsAt: true,
      mode: true,
      expiresAt: true,
      meetUrl: true,
      location: true,
      decisionNote: true,
      cancelReason: true,
      mentor: { select: { id: true, name: true, email: true, deletedAt: true } },
      mentee: { select: { id: true, name: true, email: true, deletedAt: true } },
    },
  });
  if (!meeting) return;
  const mentor = meeting.mentorId === row.userId;
  if (!mentor && meeting.menteeId !== row.userId) return;
  const recipient = mentor ? meeting.mentor : meeting.mentee,
    counterpart = mentor ? meeting.mentee : meeting.mentor;
  if (recipient.deletedAt || counterpart.deletedAt) return;
  const notice: AppointmentNotice = {
    event: payload.event,
    appointmentId: meeting.id,
    recipient: { userId: recipient.id, email: recipient.email },
    counterpartName: counterpart.name,
    startsAt: meeting.startsAt,
    mode: meeting.mode,
    expiresAt: meeting.expiresAt,
    meetUrl: meeting.meetUrl,
    location: meeting.location,
    reason:
      payload.event === 'declined'
        ? meeting.decisionNote
        : payload.event === 'cancelled'
          ? meeting.cancelReason
          : null,
    withReminder: payload.withReminder,
  };
  await createAppointmentNotifier(enqueueEmail).notify(notice);
}
export function relayPendingNotifications() {
  const db = getDb();
  return relayNotificationIntents(db, (row) => sendNotificationIntent(db, row));
}
