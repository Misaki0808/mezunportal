import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { createEmailQueue, EMAIL_QUEUE } from './email-queue';

const db = createTestPrisma();
afterAll(async () => {
  await db.$disconnect();
});

it('tamamlanmış e-posta işi 60 saniye ve bakım payı sonunda yüküyle birlikte silinir', async () => {
  const boss = await createEmailQueue(process.env.DATABASE_URL_TEST!, {
    schema: 'pgboss_email_retention_test',
    supervise: true,
  });
  try {
    const id = await boss.send(EMAIL_QUEUE, {
      to: 'retention@example.invalid',
      html: '<p>sentetik</p>',
    });
    expect(id).toBeTruthy();
    const [job] = await boss.fetch(EMAIL_QUEUE);
    expect(job?.id).toBe(id);
    await boss.complete(EMAIL_QUEUE, job!.id);
    const read = () => db.$queryRaw<Array<{ state: string; data: unknown }>>`
      SELECT state::text, data FROM pgboss_email_retention_test.job WHERE name = ${EMAIL_QUEUE} AND id = ${id}::uuid`;
    expect(await read()).toEqual([
      { state: 'completed', data: { to: 'retention@example.invalid', html: '<p>sentetik</p>' } },
    ]);
    const deadline = Date.now() + 85_000;
    let remaining = await read();
    while (remaining.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      remaining = await read();
    }
    expect(remaining).toEqual([]);
  } finally {
    await boss.stop({ graceful: true, timeout: 5_000 });
  }
}, 100_000);
