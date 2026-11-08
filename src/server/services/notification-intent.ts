import 'server-only';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { notificationRetry } from '../rules/notification-retry';
import type { AppointmentNotice } from './appointment-notifier';

const generic = z
  .object({
    type: z.literal('generic'),
    event: z.enum([
      'moderationApproved',
      'moderationRejected',
      'contact',
      'invitation',
      'faqPublished',
      'faqRejected',
      'faqRedirected',
      'faqAnswerPublished',
      'jobPostingPublished',
      'jobPostingRejected',
      'jobPostingExpired',
      'referralUpdated',
    ]),
    eventId: z.string().min(1).max(160),
    path: z.enum([
      '/deneyimlerim',
      '/hesap/iletisim',
      '/hesap/sss',
      '/ilanlarim',
      '/hesap/referanslar',
    ]),
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
const pilotInvitation = z
  .object({
    type: z.literal('pilotInvitation'),
    invitationId: z.uuid(),
    ciphertext: z.string().min(1).max(1024),
  })
  .strict();
const cvReview = z
  .object({
    type: z.literal('cvReview'),
    event: z.enum(['requested', 'answered', 'expired']),
    requestId: z.string().min(1).max(64),
  })
  .strict();
export const notificationIntentPayload = z.discriminatedUnion('type', [
  generic,
  appointment,
  pilotInvitation,
  cvReview,
]);
export type NotificationIntentPayload = z.infer<typeof notificationIntentPayload>;

type IntentWriter = Pick<Prisma.TransactionClient, 'notificationIntent'>;
/** Hesaplı bildirimler yalnız olay/kimlik taşır; davet adresi yalnız geçici şifreli biçimde tutulur. */
export async function stageNotification(
  tx: IntentWriter,
  userId: string,
  input: NotificationIntentPayload,
) {
  const payload = notificationIntentPayload.parse(input);
  const eventId =
    payload.type === 'generic'
      ? payload.eventId
      : payload.type === 'appointment'
        ? payload.appointmentId
        : payload.type === 'pilotInvitation'
          ? payload.invitationId
          : payload.requestId;
  const event = payload.type === 'pilotInvitation' ? 'invitation' : payload.event;
  const key = `${payload.type}:${event}:${eventId}:${userId}`;
  await tx.notificationIntent.upsert({
    where: { key },
    create: { key, userId, kind: payload.type, payload },
    update: {},
  });
}
// Hesabı henüz olmayan alıcının adresi, niyet işlenene dek yalnız kimlik doğrulanmış
// şifreli metin olarak tutulur. Anahtar uygulama sırrından ayrı amaç için türetilir.
function invitationKey(secret: string) {
  return createHmac('sha256', secret).update('mezunportal:pilot-invitation:v1').digest();
}
export async function stagePilotInvitation(
  tx: IntentWriter,
  actorId: string,
  address: string,
  secret: string,
) {
  const invitationId = randomUUID();
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', invitationKey(secret), nonce);
  cipher.setAAD(Buffer.from(`${actorId}:${invitationId}`));
  const encrypted = Buffer.concat([cipher.update(address, 'utf8'), cipher.final()]);
  const ciphertext = Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
  await stageNotification(tx, actorId, { type: 'pilotInvitation', invitationId, ciphertext });
}
export function openPilotInvitation(
  payload: z.infer<typeof pilotInvitation>,
  actorId: string,
  secret: string,
): string {
  const packed = Buffer.from(payload.ciphertext, 'base64url');
  if (packed.length < 29) throw new Error('INVITATION_CIPHERTEXT_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', invitationKey(secret), packed.subarray(0, 12));
  decipher.setAAD(Buffer.from(`${actorId}:${payload.invitationId}`));
  decipher.setAuthTag(packed.subarray(12, 28));
  return Buffer.concat([decipher.update(packed.subarray(28)), decipher.final()]).toString('utf8');
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
/** Her kayıt ayrı kilitlenir; hata denemesi ve bekleme aynı işlemde saklanır. FAILED yeniden seçilmez. */
export async function relayNotificationIntents(
  db: PrismaClient,
  send: IntentSender,
  options: { now?: () => Date } = {},
) {
  const now = (options.now ?? (() => new Date()))();
  let after = '',
    sent = 0,
    failed = 0;
  for (;;) {
    const rows = await db.notificationIntent.findMany({
      where: { id: { gt: after }, status: 'PENDING', nextAttemptAt: { lte: now } },
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
            if (!locked.length) return 'SKIPPED';
            const intent = await tx.notificationIntent.findUnique({
              where: { id },
              select: {
                id: true,
                userId: true,
                payload: true,
                status: true,
                attemptCount: true,
                nextAttemptAt: true,
              },
            });
            // Başka işçi bu kaydı az önce ertelemiş veya kalıcı hataya almış olabilir.
            if (
              !intent ||
              intent.status !== 'PENDING' ||
              !intent.nextAttemptAt ||
              intent.nextAttemptAt > now
            )
              return 'SKIPPED';
            try {
              await send(intent);
            } catch {
              const retry = notificationRetry(intent.attemptCount + 1, now);
              await tx.notificationIntent.update({
                where: { id },
                data: {
                  ...retry,
                  // Kalıcı hatada adresi/şifreli yükü saklamanın amacı kalmaz.
                  ...(retry.status === 'FAILED' ? { payload: Prisma.JsonNull } : {}),
                },
              });
              return retry.status;
            }
            await tx.notificationIntent.delete({ where: { id } });
            return 'SENT';
          },
          { timeout: 30000, maxWait: 10000 },
        );
        if (changed === 'SENT') sent++;
        else if (changed === 'PENDING' || changed === 'FAILED') {
          failed++;
          // Operatör uyarısı: kimlik, sağlayıcı hatası, adres veya şifreli yük taşınmaz.
          if (changed === 'FAILED') process.stderr.write('notification.intent: RETRY_EXHAUSTED\n');
        }
      } catch {
        failed++;
      }
    }
    after = rows[rows.length - 1]!.id;
  }
  return { sent, failed };
}
