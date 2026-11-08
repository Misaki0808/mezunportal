import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PgBoss } from 'pg-boss';

import { cvKit, cvUser, pdfForm } from '@/test/cv';
import { createTestPrisma } from '@/test/db';
import { uploadCv } from '../services/cv';
import { markCvParseExhausted, processCvParse } from '../services/cv-parse';
import {
  createCvQueue,
  CV_PARSE_FAILED_QUEUE,
  CV_PARSE_QUEUE,
  publishCvParse,
  startCvConsumer,
  startCvFailureConsumer,
} from './cv-queue';

const db = createTestPrisma();
let boss: PgBoss;

beforeAll(async () => {
  boss = await createCvQueue(process.env.DATABASE_URL_TEST!, {
    schema: 'pgboss_cv_test',
    retryDelay: 0,
    expireInSeconds: 60,
  });
  await boss.deleteAllJobs(CV_PARSE_QUEUE);
  await boss.deleteAllJobs(CV_PARSE_FAILED_QUEUE);
});
afterAll(async () => {
  if (boss) await boss.stop({ graceful: true, timeout: 5000 });
  await db.$disconnect();
});

async function settled(id: string, status: string) {
  for (let i = 0; i < 150; i++) {
    const row = await db.cvUpload.findUniqueOrThrow({ where: { id } });
    if (row.status === status) return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`CvUpload ${status} durumuna gelmedi`);
}

const kitWithQueue = () => {
  const kit = cvKit(db);
  return {
    ...kit,
    deps: {
      ...kit.deps,
      enqueue: (tx: Parameters<typeof publishCvParse>[1], id: string) =>
        publishCvParse(boss, tx, id),
    },
  };
};

async function startWorker(kit: ReturnType<typeof kitWithQueue>) {
  await boss.offWork(CV_PARSE_QUEUE, { wait: true });
  await startCvConsumer(boss, async (job, retryCount, retryLimit) => {
    const outcome = await processCvParse(kit.deps, job.cvUploadId, { retryCount, retryLimit });
    return outcome === 'RETRY' ? 'RETRY' : 'DONE';
  });
}

describe('cv.parse gerçek pg-boss kuyruğu', () => {
  it('yükleme → iş kuyruğa → worker ayrıştırır → PARSED (istek içinde LLM çağrısı yok)', async () => {
    const user = await cvUser(db);
    const kit = kitWithQueue();
    const upload = await uploadCv(kit.deps, user.actor, pdfForm({ scenario: 'ornek-ayse' }));
    // Worker henüz çalışmıyor: istek bitti, LLM çağrılmadı, iş kuyrukta.
    expect(kit.llm.calls).toBe(0);
    expect((await db.cvUpload.findUniqueOrThrow({ where: { id: upload.cvUploadId } })).status).toBe(
      'QUEUED',
    );
    await startWorker(kit);
    const row = await settled(upload.cvUploadId, 'PARSED');
    expect(row.parsedJson).toMatchObject({ skills: expect.any(Array) });
    expect(kit.llm.calls).toBe(1);
  });

  it('işlem geri alınırsa iş de kuyruğa girmez (outbox)', async () => {
    const before = await boss.getQueueStats(CV_PARSE_QUEUE);
    const queuedBefore = before[0]?.queuedCount ?? 0;
    await boss.offWork(CV_PARSE_QUEUE, { wait: true });
    await expect(
      db.$transaction(async (tx) => {
        await publishCvParse(boss, tx, 'geri-alinacak');
        throw new Error('geri al');
      }),
    ).rejects.toThrow('geri al');
    const after = await boss.getQueueStats(CV_PARSE_QUEUE);
    expect(after[0]?.queuedCount ?? 0).toBe(queuedBefore);
  });

  it('LLM geçici hatası pg-boss yeniden denemesiyle sürer; hak bitince FAILED + kod (3 deneme)', async () => {
    const user = await cvUser(db);
    const kit = kitWithQueue();
    await startWorker(kit);
    const upload = await uploadCv(kit.deps, user.actor, pdfForm({ scenario: 'unavailable' }));
    const row = await settled(upload.cvUploadId, 'FAILED');
    expect(row.errorCode).toBe('CV_PARSE_UNAVAILABLE');
    expect(row.storageKey).toBeNull();
    expect(kit.llm.calls).toBe(3);
    expect(kit.storage.files.size).toBe(0);
  });

  it('worker teslimi yapamadan broker denemeleri biterse ölü mektup tüketicisi satırı FAILED yapar', async () => {
    await boss.offWork(CV_PARSE_QUEUE, { wait: true });
    const user = await cvUser(db);
    const kit = kitWithQueue();
    const upload = await uploadCv(kit.deps, user.actor, pdfForm({ scenario: 'ornek-ayse' }));
    for (let i = 0; i < 3; i++) {
      const [job] = await boss.fetch(CV_PARSE_QUEUE);
      expect(job).toBeDefined();
      await boss.fail(CV_PARSE_QUEUE, job!.id, { errorCode: 'SIMULATED_WORKER_STOP' });
    }
    await startCvFailureConsumer(boss, (job) => markCvParseExhausted(kit.deps, job.cvUploadId));
    const row = await settled(upload.cvUploadId, 'FAILED');
    expect(row.errorCode).toBe('CV_PARSE_UNAVAILABLE');
    expect(kit.llm.calls).toBe(0);
  });
});
