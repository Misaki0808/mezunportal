import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import type { StorageAdapter } from '../external/storage';
import { purgeCvFiles } from './cv-parse';

/** Belgesi hâlâ bağlıysa veya yeni yükleme olabilirse silinmez. */
export async function purgeFiles(db: PrismaClient, storage: StorageAdapter, now = new Date()) {
  if (!storage.listOldGraduationKeys) throw new Error('STORAGE_ENUMERATION_UNAVAILABLE');
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
  return { ...cv, graduationRemoved };
}
