import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { fromPrisma, type PgBoss } from 'pg-boss';
import { EMAIL_QUEUE } from './email-queue';
import type { EmailOutbox } from './email-core';

/** EmailLog ve pg-boss işi aynı PostgreSQL transaction'ında commit olur. */
export function createEmailOutbox(db: PrismaClient, boss: Pick<PgBoss, 'send'>): EmailOutbox {
  return {
    withKey(key, run) {
      return db.$transaction(
        async (tx) => {
          // Aynı anahtarda hem eşzamanlı enqueue hem yinelenen worker teslimlerini sırala.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
          return run({
            async find(idempotencyKey) {
              return tx.emailLog.findUnique({
                where: { idempotencyKey },
                select: { id: true, status: true, attempts: true },
              });
            },
            async create(input) {
              return tx.emailLog.create({
                data: {
                  idempotencyKey: input.idempotencyKey,
                  template: input.template,
                  recipientUserId: input.recipientUserId,
                },
                select: { id: true, status: true, attempts: true },
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
