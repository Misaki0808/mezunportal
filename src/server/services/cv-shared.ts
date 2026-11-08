import 'server-only';

import { Prisma, type PrismaClient } from '@/generated/prisma/client';

import type { LlmAdapter } from '../external/llm';
import type { StorageAdapter } from '../external/storage';
import { loadActor } from '../permissions/actor';
import { errorForDenyReason } from '../permissions/guards';
import { evaluateAccess } from '../rules/authorization';

export type Tx = Prisma.TransactionClient;

/**
 * Bir CV işine gereken bağımlılıklar. Testler servisleri doğrudan sahte bağımlılıkla çağırır (sahte LLM,
 * bellek depolama); eylemler gerçeğini `actions/deps.ts` üzerinden verir.
 */
export type CvDeps = {
  db: PrismaClient;
  storage: StorageAdapter;
  /** `null` = sağlayıcı yapılandırılmamış, CV ayrıştırma kapalı. */
  llm: LlmAdapter | null;
  /** `cv.parse` işini AYNI işlemde (outbox) kuyruğa yazar; işlem geri alınırsa iş de yoktur. */
  enqueue: (tx: Tx, cvUploadId: string) => Promise<void>;
  dailyLimit: number;
  now?: () => Date;
  /** Dosya saklama istisnaları (varsayılan: `CV_FILE_HOLDS`). */
  holds?: readonly CvFileHold[];
};

export const nowOf = (deps: { now?: () => Date }) => (deps.now ?? (() => new Date()))();

/**
 * Açık bir CV inceleme talebine (P1-1x `CvReviewRequest`) bağlı dosya silinmez; talep kapanınca silinir
 * (docs/data.md değişmezleri). İlgili adım kendi kontrolünü buraya kaydeder; şu an inceleme talebi yoktur.
 */
export type CvFileHold = (tx: Tx, uploadIds: readonly string[]) => Promise<ReadonlySet<string>>;
export const CV_FILE_HOLDS: CvFileHold[] = [
  async (tx, uploadIds) => {
    const rows = await tx.cvReviewRequest.findMany({
      where: { cvUploadId: { in: [...uploadIds] }, status: 'OPEN' },
      select: { cvUploadId: true },
    });
    return new Set(rows.map((row) => row.cvUploadId));
  },
];

export async function heldUploadIds(
  tx: Tx,
  uploadIds: readonly string[],
  holds: readonly CvFileHold[] = CV_FILE_HOLDS,
): Promise<ReadonlySet<string>> {
  const held = new Set<string>();
  if (uploadIds.length === 0) return held;
  for (const hold of holds) for (const id of await hold(tx, uploadIds)) held.add(id);
  return held;
}

/** Hesap silme ile aynı kullanıcı satırı kilidi: yükleme, uygulama ve silme birbirini sıralar. */
export async function lockUser(tx: Tx, userId: string, now: Date = new Date()): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const actor = await loadActor(tx, userId, now);
  const decision = evaluateAccess(actor?.facts ?? null, { action: 'selfProfile' });
  if (!decision.allowed) throw errorForDenyReason(decision.reason);
}

/**
 * Dosyası duran yüklemelerin dosyalarını siler ve anahtarı boşaltır (tutulanlar hariç). Depolama silmesi
 * işlem commit edilmeden yapılır; hata fırlatırsa işlem geri alınır (veritabanı dosyayı hâlâ gösterir).
 */
export async function removeUploadFiles(
  tx: Tx,
  storage: StorageAdapter,
  rows: readonly { id: string; storageKey: string | null }[],
  holds?: readonly CvFileHold[],
): Promise<number> {
  const withFiles = rows.filter(
    (row): row is { id: string; storageKey: string } => row.storageKey !== null,
  );
  const held = await heldUploadIds(
    tx,
    withFiles.map((row) => row.id),
    holds,
  );
  let removed = 0;
  for (const row of withFiles) {
    if (held.has(row.id)) continue;
    await storage.delete(row.storageKey);
    await tx.cvUpload.update({ where: { id: row.id }, data: { storageKey: null } });
    removed += 1;
  }
  return removed;
}

export function logCv(event: string, code?: string): void {
  // Yalnız olay ve kararlı kod: CV içeriği, LLM girdisi/çıktısı, kimlik ve dosya anahtarı asla yazılmaz.
  process.stderr.write(`[cv] ${event}${code ? ` ${code}` : ''}\n`);
}

export const DbNull = Prisma.DbNull;

/** `YYYY` ya da `YYYY-MM` (yıl yoksa `null`). */
export const toYearMonth = (year: number | null, month: number | null): string | null =>
  year === null
    ? null
    : month === null
      ? String(year)
      : `${year}-${String(month).padStart(2, '0')}`;
