import { afterAll, describe, expect, it } from 'vitest';
import { PgBoss } from 'pg-boss';

import { QUEUE_MAINTENANCE } from './queue-maintenance';

import { POINTS_BACKFILL_QUEUE, createPointsRuntime } from './points';

let runtime: Awaited<ReturnType<typeof createPointsRuntime>> | undefined;
afterAll(async () => {
  await runtime?.stop();
});

describe('points.backfill çalışma zamanı', () => {
  it('kuyruğu açar; aynı anda bekleyen tek iş tutar (tekrar istek çift iş üretmez)', async () => {
    runtime = await createPointsRuntime(false, {
      schema: 'pgboss_points_test',
      connectionString: process.env.DATABASE_URL_TEST!,
    });
    const queue = await runtime.boss.getQueue(POINTS_BACKFILL_QUEUE);
    expect(queue?.retryLimit).toBe(1);
    await runtime.boss.deleteAllJobs(POINTS_BACKFILL_QUEUE);
    await runtime.enqueueBackfill();
    await runtime.enqueueBackfill();
    // İstatistik önbelleği gecikebilir; bekleyen işler doğrudan çekilerek sayılır.
    const jobs = await runtime.boss.fetch(POINTS_BACKFILL_QUEUE, { batchSize: 10 });
    expect(jobs).toHaveLength(1);
  });
});

it('tamamlanan iş 70 saniye sonra aynı tekillik penceresinde yeni işe izin vermez', async () => {
  const schema = 'pgboss_points_window_test';
  const connectionString = process.env.DATABASE_URL_TEST!;
  const producer = await createPointsRuntime(false, { schema, connectionString });
  const supervisor = new PgBoss({
    connectionString,
    schema,
    schedule: false,
    supervise: true,
    ...QUEUE_MAINTENANCE,
  });
  supervisor.on('error', () => undefined);
  try {
    await supervisor.start();
    await producer.boss.deleteAllJobs(POINTS_BACKFILL_QUEUE);
    // pg-boss pencereleri duvar saatine hizalar; test penceresi 70 saniye içinde değişmesin.
    const secondsInWindow = Math.floor(Date.now() / 1000) % 600;
    if (secondsInWindow > 510)
      await new Promise((resolve) => setTimeout(resolve, (601 - secondsInWindow) * 1000));

    await producer.enqueueBackfill();
    const [job] = await producer.boss.fetch(POINTS_BACKFILL_QUEUE);
    expect(job).toBeDefined();
    await producer.boss.complete(POINTS_BACKFILL_QUEUE, job!.id);
    await producer.enqueueBackfill();
    expect(await producer.boss.fetch(POINTS_BACKFILL_QUEUE)).toHaveLength(0);

    // Gerçek bakım döngüsü çalışırken 60 saniyelik yanlış temizlik sınırını aş.
    await new Promise((resolve) => setTimeout(resolve, 70_000));
    const completed = await producer.boss.getJobById(POINTS_BACKFILL_QUEUE, job!.id);
    await producer.enqueueBackfill();
    const duplicate = await producer.boss.fetch(POINTS_BACKFILL_QUEUE);
    expect(completed?.state).toBe('completed');
    expect(duplicate).toHaveLength(0);
  } finally {
    await supervisor.stop({ graceful: true, timeout: 5000 });
    await producer.stop();
  }
}, 240_000);
