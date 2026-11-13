import 'server-only';
import { getEnv, parseSmtpEnv } from '@/lib/env';
import { getDb } from '../db';
import { decideNotification } from '../services/notification-preferences';
import { FakeEmailTransport } from '../external/email/fake';
import { createSmtpTransport } from '../external/email/smtp';
import { createEmailService, type QueuedEmail } from './email-core';
import { createEmailOutbox } from './email-outbox';
import { decorateEmail } from './email-presentation';
import { createEmailQueue, startEmailConsumer, startEmailFailureConsumer } from './email-queue';

export async function createEmailRuntime(consume = false) {
  const env = getEnv();
  const db = getDb();
  const transport =
    env.APP_ENV === 'test'
      ? new FakeEmailTransport()
      : createSmtpTransport(parseSmtpEnv(process.env));
  const boss = await createEmailQueue(env.DATABASE_URL, { supervise: consume });
  const service = createEmailService(createEmailOutbox(db, boss), transport, undefined, (message) =>
    decideNotification(db, message),
  );
  try {
    if (consume) {
      await startEmailConsumer(boss, service.deliver);
      await startEmailFailureConsumer(boss, service.markExhausted);
    }
  } catch {
    await boss.stop();
    transport.close();
    throw new Error('EMAIL_WORKER_UNAVAILABLE');
  }
  return {
    ...service,
    enqueueEmail: (input: QueuedEmail) => service.enqueueEmail(decorateEmail(input, env.APP_URL)),
    boss,
    async stop() {
      await boss.stop({ graceful: true, timeout: 15000 });
      transport.close();
    },
  };
}
let producer: ReturnType<typeof createEmailRuntime> | undefined;
/** Yalnız sunucuda: çağıran şablon/metni hazırlar; bu fonksiyon SMTP gönderimi yapmaz. */
export async function enqueueEmail(input: QueuedEmail): Promise<{ emailLogId: string | null }> {
  producer ??= createEmailRuntime().catch(() => {
    producer = undefined;
    throw new Error('EMAIL_QUEUE_UNAVAILABLE');
  });
  try {
    return await (await producer).enqueueEmail(input);
  } catch {
    throw new Error('EMAIL_ENQUEUE_FAILED');
  }
}
