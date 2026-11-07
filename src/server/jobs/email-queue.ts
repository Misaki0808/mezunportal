import 'server-only';
import { PgBoss, type JobWithMetadata } from 'pg-boss';
import { EmailTransportError } from '../external/email/types';
import type { QueuedEmail } from './email-core';

export const EMAIL_QUEUE = 'email.send';
export const EMAIL_FAILED_QUEUE = 'email.failed';
export const EMAIL_RETRY_LIMIT = 2;
export async function createEmailQueue(
  connectionString: string,
  options: { schema?: string; supervise?: boolean; retryDelay?: number } = {},
) {
  const boss = new PgBoss({
    connectionString,
    schema: options.schema ?? 'pgboss',
    max: 4,
    schedule: false,
    supervise: options.supervise ?? false,
    persistWarnings: false,
  });
  // Sürücü/SMTP hata nesnesi kişisel veri veya bağlantı adresi taşıyabilir.
  boss.on('error', () => process.stderr.write('email.queue: unavailable\n'));
  try {
    await boss.start();
    await boss.createQueue(EMAIL_FAILED_QUEUE, {
      retryLimit: 5,
      retryDelay: 2,
      expireInSeconds: 30,
      retentionSeconds: 3600,
      deleteAfterSeconds: 60,
    });
    const settings = {
      deadLetter: EMAIL_FAILED_QUEUE,
      retryLimit: EMAIL_RETRY_LIMIT,
      retryDelay: options.retryDelay ?? 2,
      retryBackoff: options.retryDelay !== 0,
      ...(options.retryDelay === 0 ? {} : { retryDelayMax: 30 }),
      expireInSeconds: 30,
      retentionSeconds: 3600,
      deleteAfterSeconds: 60,
    };
    await boss.createQueue(EMAIL_QUEUE, settings);
    await boss.updateQueue(EMAIL_QUEUE, settings);
    return boss;
  } catch {
    await boss.stop().catch(() => undefined);
    throw new Error('EMAIL_QUEUE_UNAVAILABLE');
  }
}

export async function startEmailConsumer(
  boss: PgBoss,
  deliver: (message: QueuedEmail, retryCount: number, retryLimit: number) => Promise<void>,
) {
  return boss.work<
    QueuedEmail,
    object,
    {
      includeMetadata: true;
      perJobResults: true;
      pollingIntervalSeconds: number;
      batchSize: number;
    }
  >(
    EMAIL_QUEUE,
    { includeMetadata: true, perJobResults: true, pollingIntervalSeconds: 0.5, batchSize: 1 },
    async (jobs: JobWithMetadata<QueuedEmail>[]) => {
      return Promise.all(
        jobs.map(async (job) => {
          try {
            await deliver(job.data, job.retryCount, job.retryLimit);
            return { id: job.id, status: 'completed' as const };
          } catch (error) {
            const safe = error instanceof EmailTransportError ? error : new EmailTransportError();
            return {
              id: job.id,
              status: safe.retryable ? ('failed' as const) : ('deadletter' as const),
              output: { errorCode: safe.message },
            };
          }
        }),
      );
    },
  );
}

export async function startEmailFailureConsumer(
  boss: PgBoss,
  fail: (input: QueuedEmail) => Promise<void>,
) {
  return boss.work<QueuedEmail>(EMAIL_FAILED_QUEUE, async (jobs) => {
    try {
      for (const job of jobs) await fail(job.data);
    } catch {
      throw new Error('EMAIL_FAILURE_RECORD_UNAVAILABLE');
    }
  });
}
