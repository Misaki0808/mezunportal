import 'server-only';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { AppointmentNotice } from './appointment-notifier';

const generic = z
  .object({
    type: z.literal('generic'),
    event: z.enum(['moderationApproved', 'moderationRejected', 'contact', 'invitation']),
    eventId: z.string().min(1).max(160),
    path: z.enum(['/deneyimlerim', '/hesap/iletisim']),
  })
  .strict();
const appointment = z
  .object({
    type: z.literal('appointment'),
    event: z.enum([
      'requested',
      'confirmed',
      'declined',
      'cancelled',
      'expired',
      'reminder',
      'linkNeeded',
      'linkAdded',
    ]),
    appointmentId: z.string().min(1).max(64),
    withReminder: z.boolean().optional(),
  })
  .strict();
export const notificationIntentPayload = z.discriminatedUnion('type', [generic, appointment]);
export type NotificationIntentPayload = z.infer<typeof notificationIntentPayload>;

type IntentWriter = Pick<Prisma.TransactionClient, 'notificationIntent'>;
/** Yalnız olay/kimlik; e-posta adresi, not, ad veya görüşme bağlantısı kaydedilmez. */
export async function stageNotification(
  tx: IntentWriter,
  userId: string,
  input: NotificationIntentPayload,
) {
  const payload = notificationIntentPayload.parse(input);
  const eventId = payload.type === 'generic' ? payload.eventId : payload.appointmentId;
  const key = `${payload.type}:${payload.event}:${eventId}:${userId}`;
  await tx.notificationIntent.upsert({
    where: { key },
    create: { key, userId, kind: payload.type, payload },
    update: {},
  });
}
export async function stageAppointmentNotices(
  tx: IntentWriter,
  notices: readonly AppointmentNotice[],
) {
  for (const notice of notices)
    await stageNotification(tx, notice.recipient.userId, {
      type: 'appointment',
      event: notice.event,
      appointmentId: notice.appointmentId,
      ...(notice.withReminder ? { withReminder: true } : {}),
    });
}
export type IntentRecord = { id: string; userId: string; payload: Prisma.JsonValue };
export type IntentSender = (row: IntentRecord) => Promise<void>;
/** Her kayıt ayrı kilitlenir; kuyruk kesintisi kaydı korur, eşzamanlı işçiler çakışmaz. */
export async function relayNotificationIntents(db: PrismaClient, send: IntentSender) {
  let after = '',
    sent = 0,
    failed = 0;
  for (;;) {
    const rows = await db.notificationIntent.findMany({
      where: { id: { gt: after } },
      orderBy: { id: 'asc' },
      take: 100,
      select: { id: true, userId: true },
    });
    if (!rows.length) break;
    for (const { id, userId } of rows) {
      try {
        const changed = await db.$transaction(
          async (tx) => {
            // Hesap silmeyle aynı sıra (User → intent); KEY SHARE kuyruktaki FK kontrolüyle uyumludur.
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId} FOR KEY SHARE`;
            const locked = await tx.$queryRaw<
              { id: string }[]
            >`SELECT "id" FROM "NotificationIntent" WHERE "id"=${id} FOR UPDATE SKIP LOCKED`;
            if (!locked.length) return false;
            const intent = await tx.notificationIntent.findUnique({
              where: { id },
              select: { id: true, userId: true, payload: true },
            });
            if (!intent) return false;
            await send(intent);
            await tx.notificationIntent.delete({ where: { id } });
            return true;
          },
          { timeout: 30000, maxWait: 10000 },
        );
        if (changed) sent++;
      } catch {
        failed++;
      }
    }
    after = rows[rows.length - 1]!.id;
  }
  return { sent, failed };
}
