import 'server-only';
import { PgBoss, fromPrisma, type JobWithMetadata } from 'pg-boss';
import type { Tx } from '../services/cv-shared';
import { logUnexpected } from '../unexpected-log';

/**
 * `cv.parse` kuyruğu (pg-boss; docs/architecture.md "Bildirimler ve zamanlanmış işler"). Yükleme kaydı ve iş AYNI
 * PostgreSQL işleminde commit olur (outbox); iş yükü yalnız `cvUploadId` taşır (CV içeriği ve kişisel veri yok).
 */
export const CV_PARSE_QUEUE = 'cv.parse';
export const CV_PARSE_FAILED_QUEUE = 'cv.parse.failed';
export const CV_PARSE_RETRY_LIMIT = 2;

export type CvParseJob = { cvUploadId: string };

export async function createCvQueue(
  connectionString: string,
  options: {
    schema?: string;
    supervise?: boolean;
    retryDelay?: number;
    expireInSeconds?: number;
  } = {},
) {
  const boss = new PgBoss({
    connectionString,
    schema: options.schema ?? 'pgboss',
    max: 4,
    schedule: false,
    supervise: options.supervise ?? false,
    persistWarnings: false,
  });
  // Sürücü hata nesnesi bağlantı adresi taşıyabilir; yalnız sabit metin yazılır.
  boss.on('error', () => process.stderr.write('cv.queue: unavailable\n'));
  try {
    await boss.start();
    await boss.createQueue(CV_PARSE_FAILED_QUEUE, {
      retryLimit: 5,
      retryDelay: 2,
      expireInSeconds: 30,
      retentionSeconds: 3600,
      deleteAfterSeconds: 60,
    });
    const settings = {
      deadLetter: CV_PARSE_FAILED_QUEUE,
      retryLimit: CV_PARSE_RETRY_LIMIT,
      retryDelay: options.retryDelay ?? 5,
      retryBackoff: options.retryDelay !== 0,
      ...(options.retryDelay === 0 ? {} : { retryDelayMax: 60 }),
      // Tek LLM çağrısı 60 sn + dosya okuma/yazma payı; süre dolarsa iş yeniden teslim edilir.
      expireInSeconds: options.expireInSeconds ?? 180,
      retentionSeconds: 3600,
      deleteAfterSeconds: 60,
    };
    await boss.createQueue(CV_PARSE_QUEUE, settings);
    await boss.updateQueue(CV_PARSE_QUEUE, settings);
    return boss;
  } catch {
    await boss.stop().catch(() => undefined);
    throw new Error('CV_QUEUE_UNAVAILABLE');
  }
}

/** İşi, çağıranın açık işleminde kuyruğa yazar: işlem geri alınırsa iş de yoktur. */
export async function publishCvParse(
  boss: Pick<PgBoss, 'send'>,
  tx: Tx,
  cvUploadId: string,
): Promise<void> {
  const jobId = await boss.send(CV_PARSE_QUEUE, { cvUploadId } satisfies CvParseJob, {
    db: fromPrisma(tx),
  });
  if (!jobId) throw new Error('CV_JOB_NOT_CREATED');
}

export async function startCvConsumer(
  boss: PgBoss,
  handle: (job: CvParseJob, retryCount: number, retryLimit: number) => Promise<'DONE' | 'RETRY'>,
) {
  return boss.work<
    CvParseJob,
    object,
    {
      includeMetadata: true;
      perJobResults: true;
      pollingIntervalSeconds: number;
      batchSize: number;
    }
  >(
    CV_PARSE_QUEUE,
    { includeMetadata: true, perJobResults: true, pollingIntervalSeconds: 1, batchSize: 1 },
    async (jobs: JobWithMetadata<CvParseJob>[]) =>
      Promise.all(
        jobs.map(async (job) => {
          try {
            const outcome = await handle(job.data, job.retryCount, job.retryLimit);
            return outcome === 'RETRY'
              ? { id: job.id, status: 'failed' as const, output: { errorCode: 'CV_PARSE_RETRY' } }
              : { id: job.id, status: 'completed' as const };
          } catch (error) {
            // Beklenmeyen hata: ayrıntı (ileti, girdi) loglanmaz, yalnız tek satır olay; deneme hakkı bitince ölü mektup kuyruğuna düşer.
            logUnexpected('job', 'cv.parse', error);
            return {
              id: job.id,
              status: 'failed' as const,
              output: { errorCode: 'CV_PARSE_ERROR' },
            };
          }
        }),
      ),
  );
}

export async function startCvFailureConsumer(
  boss: PgBoss,
  exhausted: (job: CvParseJob) => Promise<void>,
) {
  return boss.work<CvParseJob>(CV_PARSE_FAILED_QUEUE, async (jobs) => {
    try {
      for (const job of jobs) await exhausted(job.data);
    } catch (error) {
      logUnexpected('job', 'cv.failureRecord', error);
      throw new Error('CV_FAILURE_RECORD_UNAVAILABLE');
    }
  });
}
