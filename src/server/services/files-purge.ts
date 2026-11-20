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
  for (const key of await storage.listOldCvKeys(new Date(now.getTime() - 60 * 60 * 1000))) {
    const retained = await db.cvUpload.findFirst({
      where: { storageKey: key },
      select: { id: true },
    });
    if (retained) continue;
    await storage.delete(key);
    orphanCvRemoved++;
  }
  return { ...cv, graduationRemoved, orphanCvRemoved };
}
