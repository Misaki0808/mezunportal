import type { CvDeps, Tx } from '@/server/services/cv-shared';
import type { PrismaClient } from '@/generated/prisma/client';
import { createFakeLlm, type FakeLlm } from '@/server/external/llm/fake';
import { createMemoryStorage, type MemoryStorage } from '@/server/external/storage/memory';
import { loadActor, type Actor } from '@/server/permissions/actor';

import { CV_SAMPLE_OUTPUTS } from './cv-samples';
import { createUser } from './fixtures';
import { buildTestPdf, type TestPdfOptions } from './pdf';

/** CV servis testleri için ortak kurulum: kullanıcı + yurt dışı rızası, kayıt tutan bağımlılıklar, PDF dosyası. */
export async function grantTransferConsent(
  db: PrismaClient,
  userId: string,
  options: { granted?: boolean; version?: string } = {},
): Promise<void> {
  await db.consent.create({
    data: {
      userId,
      documentType: 'CROSS_BORDER_TRANSFER',
      version: options.version ?? 'taslak-1',
      granted: options.granted ?? true,
    },
  });
}

export async function cvUser(
  db: PrismaClient,
  options: { consent?: boolean } = {},
): Promise<{ userId: string; actor: Actor }> {
  const userId = await createUser(db);
  if (options.consent !== false) await grantTransferConsent(db, userId);
  const actor = await loadActor(db, userId, new Date());
  if (!actor) throw new Error('kullanıcı yüklenemedi');
  return { userId, actor };
}

export type CvTestKit = {
  deps: CvDeps;
  storage: MemoryStorage;
  llm: FakeLlm;
  /** Kuyruğa yazılan iş kimlikleri (işlem commit olduktan sonra kalanlar). */
  queued: string[];
  failEnqueue: { value: boolean };
};

export function cvKit(db: PrismaClient, overrides: Partial<CvDeps> = {}): CvTestKit {
  const storage = createMemoryStorage();
  const llm = createFakeLlm({ scenarios: { ...CV_SAMPLE_OUTPUTS } });
  const queued: string[] = [];
  const failEnqueue = { value: false };
  const enqueue = async (_tx: Tx, id: string) => {
    if (failEnqueue.value) throw new Error('kuyruk kapalı');
    queued.push(id);
  };
  return {
    deps: { db, storage, llm, enqueue, dailyLimit: 50, allowFakeLinkedin: true, ...overrides },
    storage,
    llm,
    queued,
    failEnqueue,
  };
}

export const pdfForm = (options: TestPdfOptions = {}) => ({
  file: new File([new Uint8Array(buildTestPdf(options))], 'cv.pdf', { type: 'application/pdf' }),
});

export const rawForm = (bytes: Uint8Array, type = 'application/pdf') => ({
  file: new File([new Uint8Array(bytes)], 'cv.pdf', { type }),
});

/** Beceriler `Tag(SKILL)` + profil bağıdır (P1-06). */
export const skillCount = (db: PrismaClient, userId: string) =>
  db.profileTag.count({ where: { profile: { userId }, tag: { kind: 'SKILL' } } });
export const skillLabels = async (db: PrismaClient, userId: string) =>
  (
    await db.profileTag.findMany({
      where: { profile: { userId }, tag: { kind: 'SKILL' } },
      select: { tag: { select: { label: true } } },
    })
  ).map((row) => row.tag.label);
