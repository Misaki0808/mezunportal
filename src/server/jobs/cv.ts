import 'server-only';
import { getEnv } from '@/lib/env';
import { getDb } from '../db';
import { getLlm } from '../external/llm';
import { getStorage } from '../external/storage';
import { createFakePdfTextExtractor } from '../external/pdf-text';
import { markCvParseExhausted, processCvParse, type CvParseDeps } from '../services/cv-parse';
import type { Tx } from '../services/cv-shared';
import { createCvQueue, publishCvParse, startCvConsumer, startCvFailureConsumer } from './cv-queue';

/**
 * CV işi çalışma zamanı: üretici (web süreci, işlem içinde `enqueue`) ve tüketici (worker süreci). Sağlayıcı
 * yapılandırılmamışsa worker bu kuyruğu dinlemez (yükleme zaten kapalıdır).
 */
export async function createCvRuntime(consume = false) {
  const env = getEnv();
  const boss = await createCvQueue(env.DATABASE_URL, { supervise: consume });
  const deps = (): CvParseDeps => {
    const llm = getLlm();
    return {
      db: getDb(),
      storage: getStorage(),
      llm,
      pdfTextExtractor: llm?.provider === 'fake' ? createFakePdfTextExtractor() : null,
    };
  };
  try {
    if (consume) {
      await startCvConsumer(boss, async (job, retryCount, retryLimit) => {
        const outcome = await processCvParse(deps(), job.cvUploadId, { retryCount, retryLimit });
        return outcome === 'RETRY' ? 'RETRY' : 'DONE';
      });
      await startCvFailureConsumer(boss, (job) => markCvParseExhausted(deps(), job.cvUploadId));
    }
  } catch {
    await boss.stop();
    throw new Error('CV_WORKER_UNAVAILABLE');
  }
  return {
    boss,
    enqueue: (tx: Tx, cvUploadId: string) => publishCvParse(boss, tx, cvUploadId),
    async stop() {
      await boss.stop({ graceful: true, timeout: 15000 });
    },
  };
}

let producer: ReturnType<typeof createCvRuntime> | undefined;
/** Yalnız sunucuda: yükleme işleminin içinde `cv.parse` işini yazar (LLM çağrısı yapmaz). */
export async function enqueueCvParse(tx: Tx, cvUploadId: string): Promise<void> {
  producer ??= createCvRuntime().catch(() => {
    producer = undefined;
    throw new Error('CV_QUEUE_UNAVAILABLE');
  });
  await (await producer).enqueue(tx, cvUploadId);
}
