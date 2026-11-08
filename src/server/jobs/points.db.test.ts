import { afterAll, describe, expect, it } from 'vitest';

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
