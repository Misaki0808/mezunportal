import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PgBoss } from 'pg-boss';
import { createTestPrisma } from '@/test/db';
import { FakeEmailTransport } from '../external/email/fake';
import { createEmailOutbox } from './email-outbox';
import { createEmailService, type QueuedEmail } from './email-core';
import {
  createEmailQueue,
  EMAIL_QUEUE,
  EMAIL_FAILED_QUEUE,
  startEmailConsumer,
  startEmailFailureConsumer,
} from './email-queue';

const db = createTestPrisma();
let boss: PgBoss;
const transport = new FakeEmailTransport();
const logger = vi.fn();
let service: ReturnType<typeof createEmailService>;
const message = (): QueuedEmail => ({
  to: 'queue-test@example.invalid',
  subject: 'Sahte deneme',
  text: 'Sahte metin',
  template: 'test.delivery',
  idempotencyKey: randomUUID(),
});
async function settled(id: string | null, status: 'SENT' | 'FAILED') {
  if (!id) throw new Error('Beklenen e-posta kuyruğa alınmadı');
  for (let i = 0; i < 150; i++) {
    const row = await db.emailLog.findUniqueOrThrow({ where: { id } });
    if (row.status === status) return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('EmailLog durumu zamanında değişmedi');
}
beforeAll(async () => {
  boss = await createEmailQueue(process.env.DATABASE_URL_TEST!, {
    schema: 'pgboss_email_test',
    retryDelay: 0,
  });
  await boss.deleteAllJobs(EMAIL_QUEUE);
  await boss.deleteAllJobs(EMAIL_FAILED_QUEUE);
  service = createEmailService(createEmailOutbox(db, boss), transport, logger);
});
afterAll(async () => {
  if (boss) await boss.stop({ graceful: true, timeout: 5000 });
  await db.$disconnect();
});

describe('pg-boss + EmailLog gerçek veritabanı', () => {
  it('eşzamanlı aynı anahtarda tek kayıt/iş oluşur; worker isteğin dışında bir kez gönderir', async () => {
    const input = message();
    const results = await Promise.all(Array.from({ length: 8 }, () => service.enqueueEmail(input)));
    expect(new Set(results.map((result) => result.emailLogId)).size).toBe(1);
    expect(await db.emailLog.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
    expect(transport.sent).toHaveLength(0);
    await startEmailConsumer(boss, service.deliver);
    const id = results[0]!.emailLogId;
    const row = await settled(id, 'SENT');
    expect(row.attempts).toBe(1);
    expect(transport.sent.filter((email) => email.to === input.to)).toHaveLength(1);
    await service.deliver(input, 1, 2);
    expect(transport.sent).toHaveLength(1);
    expect(Object.keys(row)).not.toContain('to');
    expect(Object.keys(row)).not.toContain('text');
  });
  it('publish başarısızsa EmailLog da geri alınır', async () => {
    const input = message();
    const queue = {
      send: async () => {
        throw new Error('queue unavailable');
      },
    };
    const outbox = createEmailOutbox(db, queue);
    const failing = createEmailService(outbox, transport, logger);
    await expect(failing.enqueueEmail(input)).rejects.toThrow();
    expect(await db.emailLog.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(0);
  });
  it('SMTP geçici hatası gerçek pg-boss yeniden denemesiyle başarılı olur', async () => {
    await boss.offWork(EMAIL_QUEUE, { wait: true });
    const input = message(),
      fake = new FakeEmailTransport(['temporary', 'ok']);
    const retrying = createEmailService(createEmailOutbox(db, boss), fake, logger);
    await startEmailConsumer(boss, retrying.deliver);
    const { emailLogId } = await retrying.enqueueEmail(input);
    const row = await settled(emailLogId, 'SENT');
    expect(row.attempts).toBe(2);
    expect(row.errorCode).toBeNull();
    expect(fake.sent).toHaveLength(1);
  });
  it('son yeniden denemede FAILED kalıcıdır; raw sağlayıcı hatası saklanmaz', async () => {
    await boss.offWork(EMAIL_QUEUE, { wait: true });
    const input = message(),
      fake = new FakeEmailTransport(['temporary', 'temporary', 'temporary']);
    const failing = createEmailService(createEmailOutbox(db, boss), fake, logger);
    await startEmailConsumer(boss, failing.deliver);
    const { emailLogId } = await failing.enqueueEmail(input);
    const row = await settled(emailLogId, 'FAILED');
    expect(row.attempts).toBe(3);
    expect(row.errorCode).toBe('EMAIL_TRANSPORT_UNAVAILABLE');
  });
});

it('worker teslimi yapamadan broker denemeleri biterse de body içermeyen FAILED kaydı kalır', async () => {
  await boss.offWork(EMAIL_QUEUE, { wait: true });
  const input = message();
  const { emailLogId } = await service.enqueueEmail(input);
  for (let i = 0; i < 3; i++) {
    const [job] = await boss.fetch(EMAIL_QUEUE);
    expect(job).toBeDefined();
    await boss.fail(EMAIL_QUEUE, job!.id, { errorCode: 'SIMULATED_WORKER_STOP' });
  }
  await startEmailFailureConsumer(boss, service.markExhausted);
  const row = await settled(emailLogId, 'FAILED');
  expect(row.errorCode).toBe('EMAIL_DELIVERY_EXHAUSTED');
});
