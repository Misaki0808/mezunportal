import 'server-only';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { fromPrisma, type PgBoss } from 'pg-boss';
import { EMAIL_QUEUE } from './email-queue';
import type { EmailOutbox } from './email-core';

/** EmailLog ve pg-boss işi aynı PostgreSQL transaction'ında commit olur. */
export function createEmailOutbox(db: PrismaClient, boss: Pick<PgBoss, 'send'>): EmailOutbox {
  return {
    withKey(key, run, recipient) {
      return db.$transaction(
        async (tx) => {
          const existing = await tx.emailLog.findUnique({
            where: { idempotencyKey: key },
            select: { recipientUserId: true },
          });
          let recipientUserId = existing?.recipientUserId ?? recipient?.recipientUserId;
          if (!recipientUserId && recipient?.template === 'auth.sign-in-link') {
            recipientUserId = (
              await tx.user.findFirst({
                where: { email: { equals: recipient.to, mode: 'insensitive' } },
                select: { id: true },
              })
            )?.id;
          }
          // Silme FOR UPDATE alır. Önce kullanıcı, sonra iş anahtarı: teslim silmeden önce tamamlanır
          // veya silme commit'inden sonra güncel uygunlukla reddedilir; SMTP silmeden sonra başlayamaz.
          if (recipientUserId) {
            await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${recipientUserId} FOR SHARE`;
          }
          // Aynı anahtarda hem eşzamanlı enqueue hem yinelenen worker teslimlerini sırala.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
          return run({
            recipientUserId,
            async find(idempotencyKey) {
              return tx.emailLog.findUnique({
                where: { idempotencyKey },
                select: { id: true, status: true, attempts: true, recipientUserId: true },
              });
            },
            async create(input) {
              return tx.emailLog.create({
                data: {
                  idempotencyKey: input.idempotencyKey,
                  template: input.template,
                  recipientUserId: recipientUserId ?? input.recipientUserId,
                },
                select: { id: true, status: true, attempts: true, recipientUserId: true },
              });
            },
            async publish(id, input) {
              const jobId = await boss.send(EMAIL_QUEUE, input, { id, db: fromPrisma(tx) });
              if (!jobId) throw new Error('EMAIL_JOB_NOT_CREATED');
            },
            async mark(id, state) {
              await tx.emailLog.update({ where: { id }, data: state });
            },
          });
        },
        { timeout: 25_000, maxWait: 10_000 },
      );
    },
  };
}

/** Bekleyen teslimleri aynı silme işleminde kapatır. Eski kimliksiz giriş işleri adresinden bulunur. */
export async function cancelUserEmails(
  tx: Prisma.TransactionClient,
  userId: string,
  email: string,
) {
  const [table] = await tx.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass('pgboss.job') IS NOT NULL AS "exists"`;
  let queuedIds: string[] = [];
  if (table?.exists) {
    const jobs = await tx.$queryRaw<Array<{ id: string }>>`
      DELETE FROM pgboss.job WHERE name = ${EMAIL_QUEUE}
      AND state IN ('created', 'retry', 'active')
      AND (data->>'recipientUserId' = ${userId} OR lower(data->>'to') = lower(${email}))
      RETURNING id::text`;
    queuedIds = jobs.map((job) => job.id);
  }
  await tx.emailLog.updateMany({
    where: { status: 'QUEUED', OR: [{ recipientUserId: userId }, { id: { in: queuedIds } }] },
    data: { status: 'FAILED', errorCode: 'EMAIL_RECIPIENT_INELIGIBLE', sentAt: null },
  });
}
