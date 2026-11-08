import 'server-only';

import { PgBoss } from 'pg-boss';

import { getEnv } from '@/lib/env';

import { getDb } from '../db';
import { runPointBackfill } from '../services/points';

/**
 * `points.backfill` (pg-boss): puan motoru devreye girdiğinde BİR KEZ çalışan geriye dönük hesaplama. Sistem yöneticisi
 * `requestPointBackfill` ile kuyruğa yazar; aynı anda en çok bir iş bekler (`singletonKey` + 10 dakikalık pencere). İş idempotenttir: tekrar
 * çalışması yeni kayıt eklemez. Günlük işler (`points.finalize`, `points.suspicionScan`) bildirim worker'ındadır.
 */
export const POINTS_BACKFILL_QUEUE = 'points.backfill';
const BACKFILL_THROTTLE_SECONDS = 600;

export async function createPointsRuntime(
  consume = false,
  options: { schema?: string; connectionString?: string } = {},
) {
  const boss = new PgBoss({
    connectionString: options.connectionString ?? getEnv().DATABASE_URL,
    schema: options.schema ?? 'pgboss',
    max: 3,
    schedule: false,
    supervise: consume,
    persistWarnings: false,
  });
  // Sürücü hata nesnesi bağlantı adresi taşıyabilir; yalnız sabit metin yazılır.
  boss.on('error', () => process.stderr.write('points.queue: unavailable\n'));
  try {
    await boss.start();
    await boss.createQueue(POINTS_BACKFILL_QUEUE, {
      retryLimit: 1,
      expireInSeconds: 1800,
      retentionSeconds: 3600,
      deleteAfterSeconds: 600,
    });
    if (consume) {
      await boss.work(POINTS_BACKFILL_QUEUE, { batchSize: 1 }, async () => {
        await runPointBackfill({ db: getDb() });
      });
    }
  } catch {
    await boss.stop().catch(() => undefined);
    throw new Error('POINTS_WORKER_UNAVAILABLE');
  }
  return {
    boss,
    async enqueueBackfill() {
      // Çift tıklama / tekrar istek aynı pencerede tek iş üretir (iş zaten idempotent; bu yalnız boşa çalışmayı önler).
      await boss.send(
        POINTS_BACKFILL_QUEUE,
        {},
        { singletonKey: 'backfill', singletonSeconds: BACKFILL_THROTTLE_SECONDS },
      );
    },
    async stop() {
      await boss.stop({ graceful: true, timeout: 15000 });
    },
  };
}

let producer: ReturnType<typeof createPointsRuntime> | undefined;
/** Yalnız sunucuda: geriye dönük hesaplama işini kuyruğa yazar (kuyruk ulaşılamazsa fırlatır). */
export async function enqueuePointBackfill(): Promise<void> {
  producer ??= createPointsRuntime().catch(() => {
    producer = undefined;
    throw new Error('POINTS_QUEUE_UNAVAILABLE');
  });
  await (await producer).enqueueBackfill();
}
