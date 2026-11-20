import { mkdtemp, rm, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createTestPrisma } from '@/test/db';
import { cvKit, cvUser, pdfForm } from '@/test/cv';
import { createLocalStorage } from '../external/storage';
import { uploadCv } from './cv';
import { purgeFiles } from './files-purge';

const db = createTestPrisma();
afterAll(() => db.$disconnect());

it('eski öksüz CV silinir; yeni öksüz ve veritabanına bağlı CV korunur', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cv-orphan-'));
  try {
    const storage = createLocalStorage(root);
    const { userId, actor } = await cvUser(db);
    const kit = cvKit(db, { storage });
    const created = await uploadCv(kit.deps, actor, pdfForm());
    const linked = (await db.cvUpload.findUniqueOrThrow({ where: { id: created.cvUploadId } }))
      .storageKey!;
    const orphan = `cv/${userId}/orphan.pdf`;
    const recent = `cv/${userId}/recent.pdf`;
    for (const key of [orphan, recent])
      await storage.put(key, new Uint8Array([1]), { contentType: 'application/pdf' });
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const key of [orphan, linked]) await utimes(path.join(root, key), old, old);
    const result = await purgeFiles(db, storage);
    expect(result.orphanCvRemoved).toBe(1);
    expect(await storage.get(orphan)).toBeNull();
    expect(await storage.get(recent)).not.toBeNull();
    expect(await storage.get(linked)).not.toBeNull();
    expect((await purgeFiles(db, storage)).orphanCvRemoved).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
