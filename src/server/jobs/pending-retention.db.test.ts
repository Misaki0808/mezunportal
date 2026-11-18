import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgBoss } from 'pg-boss';
import { APPOINTMENT_SWEEP_QUEUE, createAppointmentRuntime } from './appointment';
import {
  CV_PARSE_FAILED_QUEUE,
  CV_PARSE_QUEUE,
  CV_PENDING_RETENTION_SECONDS,
  createCvQueue,
} from './cv-queue';
import {
  POINTS_BACKFILL_QUEUE,
  POINTS_PENDING_RETENTION_SECONDS,
  createPointsRuntime,
} from './points';
import { QUEUE_MAINTENANCE } from './queue-maintenance';

const schema = 'pgboss_retention_w2_test';
const queues = [
  APPOINTMENT_SWEEP_QUEUE,
  CV_PARSE_QUEUE,
  CV_PARSE_FAILED_QUEUE,
  POINTS_BACKFILL_QUEUE,
];
let appointment: Awaited<ReturnType<typeof createAppointmentRuntime>>;
let cv: PgBoss;
let points: Awaited<ReturnType<typeof createPointsRuntime>>;
let supervisor: PgBoss;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, seconds: number) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    if (await check()) return true;
    await sleep(300);
  }
  return check();
}
beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL_TEST!;
  appointment = await createAppointmentRuntime(false, { schema, connectionString });
  cv = await createCvQueue(connectionString, { schema });
  points = await createPointsRuntime(false, { schema, connectionString });
  for (const name of queues) await appointment.boss.deleteAllJobs(name);
  supervisor = new PgBoss({
    connectionString,
    schema,
    schedule: false,
    supervise: true,
    ...QUEUE_MAINTENANCE,
  });
  supervisor.on('error', () => undefined);
  await supervisor.start();
});
afterAll(async () => {
  await supervisor?.stop({ graceful: true, timeout: 5000 });
  await points?.stop();
  await cv?.stop({ graceful: true, timeout: 5000 });
  await appointment?.stop();
});

describe('bekleyen kuyruk işlerinin bakım süresi', () => {
  it('mevcut kuyrukların ayarı yenilenir; yeni işlerin ömrü ve tamamlananların temizliği ayrıdır', async () => {
    // Eski kurulumdaki kuyrukları yeniden açma, yalnız yeni kurulumları değil yükseltmeleri de kapsar.
    for (const name of [CV_PARSE_QUEUE, CV_PARSE_FAILED_QUEUE, POINTS_BACKFILL_QUEUE]) {
      await appointment.boss.updateQueue(name, { retentionSeconds: 3600, deleteAfterSeconds: 600 });
    }
    const updatedCv = await createCvQueue(process.env.DATABASE_URL_TEST!, { schema });
    const updatedPoints = await createPointsRuntime(false, {
      schema,
      connectionString: process.env.DATABASE_URL_TEST!,
    });
    try {
      expect(CV_PENDING_RETENTION_SECONDS).toBe(24 * 60 * 60);
      expect(POINTS_PENDING_RETENTION_SECONDS).toBe(7 * 24 * 60 * 60);
      const expected = new Map([
        [APPOINTMENT_SWEEP_QUEUE, 600],
        [CV_PARSE_QUEUE, CV_PENDING_RETENTION_SECONDS],
        [CV_PARSE_FAILED_QUEUE, CV_PENDING_RETENTION_SECONDS],
        [POINTS_BACKFILL_QUEUE, POINTS_PENDING_RETENTION_SECONDS],
      ]);
      for (const [name, seconds] of expected) {
        const queue = await appointment.boss.getQueue(name);
        expect(queue?.retentionSeconds).toBe(seconds);
        expect(queue?.deleteAfterSeconds).toBe(name === POINTS_BACKFILL_QUEUE ? 600 : 60);
        const id = await appointment.boss.send(name, { marker: 'default' });
        expect(id).toBeTruthy();
        const job = await appointment.boss.getJobById(name, id!);
        expect(job).not.toBeNull();
        expect(Math.round((job!.keepUntil.getTime() - job!.startAfter.getTime()) / 1000)).toBe(
          seconds,
        );
        await appointment.boss.deleteAllJobs(name);
      }
    } finally {
      await updatedPoints.stop();
      await updatedCv.stop({ graceful: true, timeout: 5000 });
    }
  }, 30_000);
  it('işçi kapalıyken kısa süreli işler silinir; uzun süreli işler kalır ve işçi açılınca bir kez işlenir', async () => {
    const shortIds = new Map<string, string>();
    const keptIds = new Map<string, string>();
    for (const name of queues) {
      const short = await appointment.boss.send(name, { marker: 'short' }, { retentionSeconds: 3 });
      const kept = await appointment.boss.send(name, { marker: 'kept' }, { retentionSeconds: 60 });
      expect(short).toBeTruthy();
      expect(kept).toBeTruthy();
      shortIds.set(name, short!);
      keptIds.set(name, kept!);
    }
    expect(
      await until(async () => {
        for (const name of queues)
          if (await appointment.boss.getJobById(name, shortIds.get(name)!)) return false;
        return true;
      }, 35),
      'bakım süresi dolan işleri silmedi',
    ).toBe(true);
    for (const name of queues) {
      expect(await appointment.boss.getJobById(name, shortIds.get(name)!)).toBeNull();
      expect((await appointment.boss.getJobById(name, keptIds.get(name)!))?.state).toBe('created');
    }
    const seen = new Map<string, number>();
    for (const name of queues) {
      await supervisor.work(name, { pollingIntervalSeconds: 1, batchSize: 10 }, async (jobs) => {
        for (const job of jobs) seen.set(job.id, (seen.get(job.id) ?? 0) + 1);
      });
    }
    expect(
      await until(async () => queues.every((name) => seen.get(keptIds.get(name)!) === 1), 30),
    ).toBe(true);
    expect([...seen.values()]).toEqual([1, 1, 1, 1]);
  }, 90_000);
});
