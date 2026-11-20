import { lstat, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
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

it('CV anahtar indeksi migration ile oluşturulur', async () => {
  const indexes = await db.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'CvUpload'
      AND indexname = 'CvUpload_storageKey_idx'
  `;
  expect(indexes).toHaveLength(1);
  expect(indexes[0]!.indexdef).toContain('("storageKey")');
});

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
    const photoId = '00000001-89ab-cdef-0123-456789abcdef';
    await storage.put(`photo/${userId}/${photoId}-512.webp`, new Uint8Array([1]), {
      contentType: 'image/webp',
    });
    await utimes(path.join(root, `photo/${userId}/${photoId}-512.webp`), old, old);
    const temporary = [
      `${linked}.012345abcdef.tmp`,
      `graduation/${userId}/partial.pdf.012345abcdef.tmp`,
      `photo/${userId}/00000002-89ab-cdef-0123-456789abcdef-96.webp.012345abcdef.tmp`,
    ];
    for (const key of temporary) {
      const file = path.join(root, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, 'yarım');
      await utimes(file, old, old);
    }
    const result = await purgeFiles(db, storage);
    expect(result.orphanCvRemoved).toBe(1);
    expect(result.temporaryRemoved).toBe(3);
    for (const key of temporary)
      await expect(lstat(path.join(root, key))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await storage.get(orphan)).toBeNull();
    expect(await storage.get(recent)).not.toBeNull();
    expect(await storage.get(linked)).not.toBeNull();
    expect(await storage.get(`photo/${userId}/${photoId}-512.webp`)).not.toBeNull(); // asıl fotoğraf eski olsa da kalır
    expect((await purgeFiles(db, storage)).orphanCvRemoved).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
