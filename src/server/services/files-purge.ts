import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import type { StorageAdapter } from '../external/storage';
import { purgeCvFiles } from './cv-parse';

/** Belgesi hâlâ bağlıysa veya yeni yükleme olabilirse silinmez. */
export async function purgeFiles(db: PrismaClient, storage: StorageAdapter, now = new Date()) {
  if (!storage.listOldGraduationKeys || !storage.listOldCvKeys)
    throw new Error('STORAGE_ENUMERATION_UNAVAILABLE');
  const cv = await purgeCvFiles({ db, storage, llm: null, now: () => now });
  const candidates = await storage.listOldGraduationKeys(new Date(now.getTime() - 60 * 60 * 1000));
  let graduationRemoved = 0;
  for (const key of candidates) {
    const retained = await db.graduationDocument.findFirst({
      where: { storageKey: key },
      select: { id: true },
    });
    if (retained) continue;
    await storage.delete(key);
    graduationRemoved++;
  }
  let orphanCvRemoved = 0;
  // Yüklemenin DB işlemi en çok 30 sn: bir saatlik pay, henüz bağlanmamış PDF ve .tmp'yi korur.
  const before = new Date(now.getTime() - 60 * 60 * 1000);
  const cvCandidates = await storage.listOldCvKeys(before);
  for (let offset = 0; offset < cvCandidates.length; offset += 500) {
    const batch = cvCandidates.slice(offset, offset + 500);
    const retained = await db.cvUpload.findMany({
      where: { storageKey: { in: batch } },
      select: { storageKey: true },
    });
    const retainedKeys = new Set(retained.map((row) => row.storageKey));
    for (const key of batch) {
      if (retainedKeys.has(key)) continue;
      await storage.delete(key);
      orphanCvRemoved++;
    }
  }
  const temporaryRemoved = (await storage.purgeTemporaryFiles?.(before)) ?? 0;
  return { ...cv, graduationRemoved, orphanCvRemoved, temporaryRemoved };
}
