import 'server-only';

import {
  CV_PARSED_JSON_MAX_BYTES,
  parsedCvItemCount,
  parsedCvJsonSchema,
  parsedCvSchema,
  type CvParseFailureCode,
  type ParsedCv,
} from '@/contracts/cv';
import type { Prisma } from '@/generated/prisma/client';

import { CV_SYSTEM_INSTRUCTION, LlmError } from '../external/llm';
import { hasActiveConsent } from '../rules/consent';
import { DbNull, heldUploadIds, logCv, nowOf, type CvDeps } from './cv-shared';

/**
 * `cv.parse` işinin gövdesi (docs/architecture.md "CV ayrıştırma hattı" adım 2). İş kuyruğu bunu çağırır; istek
 * içinde LLM çağrısı yoktur. Kurallar: (1) iş başlarken rıza YENİDEN denetlenir (yükleme ile iş arasında geri
 * çekilmiş rıza varsa LLM'e hiçbir şey gitmez); (2) çıktı `parsedCvSchema` ile doğrulanır, uymazsa BİR KEZ yeniden
 * denenir, sonra `FAILED` + kararlı kod; (3) LLM girdisi/çıktısı ve sağlayıcı hatası loglanmaz; (4) başarılı çıktı
 * yalnız `PARSED` satırında durur — profile HİÇBİR ŞEY yazılmaz (yazmak kullanıcı onayıyla `applyCv`'nin işi).
 */

export type CvParseDeps = Pick<CvDeps, 'db' | 'storage' | 'llm' | 'now' | 'holds'> & {
  /** Tek LLM çağrısının zaman aşımı (ms); varsayılan 60 sn. */
  timeoutMs?: number;
};
export type CvParseContext = { retryCount: number; retryLimit: number };
export type CvParseOutcome = 'SKIPPED' | 'PARSED' | 'FAILED' | 'RETRY';

export const CV_PARSE_TIMEOUT_MS = 60_000;
const OUTPUT_ATTEMPTS = 2;

type Failure = { code: CvParseFailureCode; retryable: boolean };

async function callWithTimeout(deps: CvParseDeps, pdf: Uint8Array): Promise<unknown> {
  const llm = deps.llm;
  if (!llm) throw new LlmError('UNAVAILABLE');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new LlmError('TIMEOUT'));
    }, deps.timeoutMs ?? CV_PARSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([
      llm.parseCv({
        pdf,
        instruction: CV_SYSTEM_INSTRUCTION,
        schema: parsedCvJsonSchema(),
        signal: controller.signal,
      }),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Ham çıktıyı doğrular; geçersizse `null` (neden loglanmaz: içerik taşıyabilir). */
function validateOutput(raw: unknown): ParsedCv | null {
  const result = parsedCvSchema.safeParse(raw);
  if (!result.success) return null;
  if (JSON.stringify(result.data).length > CV_PARSED_JSON_MAX_BYTES) return null;
  return result.data;
}

function failureOf(error: unknown): Failure {
  if (error instanceof LlmError) {
    if (error.code === 'REJECTED') return { code: 'CV_PARSE_INVALID_OUTPUT', retryable: false };
    return {
      code: error.code === 'TIMEOUT' ? 'CV_PARSE_TIMEOUT' : 'CV_PARSE_UNAVAILABLE',
      retryable: true,
    };
  }
  // Beklenmeyen adaptör hatası: ayrıntısı loglanmaz, geçici sayılır.
  return { code: 'CV_PARSE_UNAVAILABLE', retryable: true };
}

/** Dosyayı siler (olmazsa anahtar kalır, `purge` temizler) ve satırı `FAILED` yapar. */
async function failUpload(
  deps: CvParseDeps,
  id: string,
  storageKey: string | null,
  code: CvParseFailureCode,
  from: readonly ('QUEUED' | 'PARSING')[] = ['PARSING'],
): Promise<void> {
  let deleted = storageKey === null;
  if (storageKey) {
    try {
      await deps.storage.delete(storageKey);
      deleted = true;
    } catch {
      logCv('file_delete_failed', 'STORAGE');
    }
  }
  await deps.db.cvUpload.updateMany({
    where: { id, status: { in: [...from] } },
    data: {
      status: 'FAILED',
      errorCode: code,
      parsedJson: DbNull,
      ...(deleted ? { storageKey: null } : {}),
    },
  });
  logCv('failed', code);
}

export async function processCvParse(
  deps: CvParseDeps,
  cvUploadId: string,
  context: CvParseContext,
): Promise<CvParseOutcome> {
  const { db, storage } = deps;
  const claimed = await db.cvUpload.updateMany({
    where: { id: cvUploadId, status: { in: ['QUEUED', 'PARSING'] } },
    data: { status: 'PARSING', attempts: { increment: 1 } },
  });
  // Satır yok (hesap silindi), ya da zaten sonuçlanmış: iş tekrar teslimi güvenle atlanır.
  if (claimed.count === 0) return 'SKIPPED';

  const upload = await db.cvUpload.findUnique({
    where: { id: cvUploadId },
    select: { userId: true, storageKey: true },
  });
  if (!upload) return 'SKIPPED';
  const fail = async (code: CvParseFailureCode): Promise<CvParseOutcome> => {
    await failUpload(deps, cvUploadId, upload.storageKey, code);
    return 'FAILED';
  };
  const retryOrFail = async (failure: Failure): Promise<CvParseOutcome> => {
    if (failure.retryable && context.retryCount < context.retryLimit) {
      await db.cvUpload.updateMany({
        where: { id: cvUploadId, status: 'PARSING' },
        data: { status: 'QUEUED' },
      });
      logCv('retry', failure.code);
      return 'RETRY';
    }
    return fail(failure.code);
  };

  if (!deps.llm) return fail('CV_PROVIDER_NOT_CONFIGURED');
  // Rıza iş başında yeniden okunur: geri çekilmiş/eskimiş rıza varsa LLM'e hiçbir şey gitmez.
  const records = await db.consent.findMany({
    where: { userId: upload.userId },
    select: { documentType: true, version: true, granted: true, createdAt: true },
  });
  if (!hasActiveConsent(records, 'CROSS_BORDER_TRANSFER')) {
    return fail('CV_TRANSFER_CONSENT_REQUIRED');
  }
  if (!upload.storageKey) return fail('CV_PARSE_UNAVAILABLE');

  let pdf: Uint8Array | null;
  try {
    pdf = await storage.get(upload.storageKey);
  } catch {
    return retryOrFail({ code: 'CV_PARSE_UNAVAILABLE', retryable: true });
  }
  if (!pdf) return fail('CV_PARSE_UNAVAILABLE');

  let parsed: ParsedCv | null = null;
  for (let attempt = 1; attempt <= OUTPUT_ATTEMPTS && !parsed; attempt += 1) {
    let raw: unknown;
    try {
      raw = await callWithTimeout(deps, pdf);
    } catch (error) {
      return retryOrFail(failureOf(error));
    }
    parsed = validateOutput(raw);
  }
  if (!parsed) return fail('CV_PARSE_INVALID_OUTPUT');
  if (parsedCvItemCount(parsed) === 0) return fail('CV_PARSE_EMPTY');

  const saved = await db.cvUpload.updateMany({
    where: { id: cvUploadId, status: 'PARSING' },
    data: { status: 'PARSED', parsedJson: parsed as Prisma.InputJsonValue, errorCode: null },
  });
  if (saved.count === 0) return 'SKIPPED';
  logCv('parsed');
  return 'PARSED';
}

/** İş deneme hakkını tüketti (worker duruşu vb.): kullanıcı yeni yükleme yapabilsin diye `FAILED` yapılır. */
export async function markCvParseExhausted(deps: CvParseDeps, cvUploadId: string): Promise<void> {
  const row = await deps.db.cvUpload.findFirst({
    where: { id: cvUploadId, status: { in: ['QUEUED', 'PARSING'] } },
    select: { storageKey: true },
  });
  if (!row) return;
  await failUpload(deps, cvUploadId, row.storageKey, 'CV_PARSE_UNAVAILABLE', ['QUEUED', 'PARSING']);
}

// ---------------------------------------------------------------------------------------------
// Günlük emniyet (`files.purge`): bağlı olmayan eski CV dosyaları + takılı işler
// ---------------------------------------------------------------------------------------------

const PURGE_GRACE_MS = 60 * 60 * 1000;
const STUCK_MS = 24 * 60 * 60 * 1000;
/** Kullanıcının hiç onaylamadığı/atmadığı ayrıştırma çıktısı (kişisel veri) en çok bu kadar bekler. */
export const PARSED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const PURGE_BATCH = 500;

/**
 * Silinmemiş kalmış dosyaları temizler: `FAILED`/`DISCARDED` satırların ve kullanıcının son uygulanan CV'sinden
 * eski `APPLIED` satırların dosyaları (açık incelemeye bağlı olanlar hariç); 24 saatten uzun süredir
 * `QUEUED`/`PARSING` kalan işler `FAILED` yapılır (kullanıcının yükleme hakkı sonsuza kadar kilitlenmesin); 7 günden
 * uzun süredir onay bekleyen sonuç atılır (ayrıştırma çıktısı geçicidir).
 */
export async function purgeCvFiles(
  deps: CvParseDeps,
): Promise<{ filesRemoved: number; stuckFailed: number; expiredParsed: number }> {
  const now = nowOf(deps);
  const grace = new Date(now.getTime() - PURGE_GRACE_MS);
  const stuckBefore = new Date(now.getTime() - STUCK_MS);
  const parsedBefore = new Date(now.getTime() - PARSED_RETENTION_MS);

  // Onay bekleyip unutulan sonuç: ayrıştırma çıktısı (kişisel veri) temizlenir; dosya aşağıdaki süpürmede silinir.
  const expired = await deps.db.cvUpload.updateMany({
    where: { status: 'PARSED', updatedAt: { lt: parsedBefore } },
    data: { status: 'DISCARDED', parsedJson: DbNull },
  });

  const stuck = await deps.db.cvUpload.findMany({
    where: { status: { in: ['QUEUED', 'PARSING'] }, updatedAt: { lt: stuckBefore } },
    select: { id: true, storageKey: true },
    take: PURGE_BATCH,
  });
  for (const row of stuck) {
    await failUpload(deps, row.id, row.storageKey, 'CV_PARSE_UNAVAILABLE', ['QUEUED', 'PARSING']);
  }

  const candidates = await deps.db.$queryRaw<{ id: string; storageKey: string }[]>`
    SELECT c."id", c."storageKey" FROM "CvUpload" c
    WHERE c."storageKey" IS NOT NULL AND c."updatedAt" < ${grace}
      AND (
        c."status" IN ('FAILED', 'DISCARDED')
        OR (c."status" = 'APPLIED' AND EXISTS (
          SELECT 1 FROM "CvUpload" n
          WHERE n."userId" = c."userId" AND n."status" = 'APPLIED'
            AND (n."appliedAt" > c."appliedAt" OR (n."appliedAt" = c."appliedAt" AND n."id" > c."id"))))
      )
    ORDER BY c."updatedAt" ASC
    LIMIT ${PURGE_BATCH}`;
  const held = await heldUploadIds(
    deps.db,
    candidates.map((row) => row.id),
    deps.holds,
  );
  let filesRemoved = 0;
  for (const row of candidates) {
    if (held.has(row.id)) continue;
    try {
      await deps.storage.delete(row.storageKey);
      await deps.db.cvUpload.update({ where: { id: row.id }, data: { storageKey: null } });
      filesRemoved += 1;
    } catch {
      logCv('purge_failed', 'STORAGE');
    }
  }
  return { filesRemoved, stuckFailed: stuck.length, expiredParsed: expired.count };
}
