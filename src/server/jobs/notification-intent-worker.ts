import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { getDb } from '../db';
import { getAuthEnv } from '@/lib/env';
import messages from '../../../messages/tr.json';
import { enqueueEmail } from './email';
import {
  createAppointmentNotifier,
  type AppointmentNotice,
} from '../services/appointment-notifier';
import { sendNotification } from '../services/notification-email';
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
