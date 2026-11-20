import { mkdtemp, rm, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@/generated/prisma/client';
import { createLocalStorage } from '../external/storage';
vi.mock('./cv-parse', () => ({
  purgeCvFiles: vi.fn().mockResolvedValue({ filesRemoved: 0, stuckFailed: 0, expiredParsed: 0 }),
}));
import { purgeFiles } from './files-purge';

describe('dosya temizliği', () => {
  it('CV bağlılığını sınırlı toplu sorgularla ölçer; sınırların iki yanındaki bağlı anahtarlar silinmez', async () => {
    const candidates = Array.from({ length: 1003 }, (_, index) => `cv/user/file-${index}.pdf`);
    const linked = new Set([0, 499, 500, 999, 1000, 1002].map((index) => candidates[index]!));
    const findMany = vi.fn(async ({ where }: { where: { storageKey: { in: string[] } } }) =>
      where.storageKey.in.filter((key) => linked.has(key)).map((storageKey) => ({ storageKey })),
    );
    const storage = {
      listOldGraduationKeys: vi.fn().mockResolvedValue([]),
      listOldCvKeys: vi.fn().mockResolvedValue(candidates),
      delete: vi.fn().mockResolvedValue(undefined),
      purgeTemporaryFiles: vi.fn().mockResolvedValue(2),
    };
    const now = new Date('2030-01-01T12:00:00Z');
    const result = await purgeFiles(
      { cvUpload: { findMany } } as unknown as PrismaClient,
      storage as unknown as Parameters<typeof purgeFiles>[1],
      now,
    );
    expect(result.orphanCvRemoved).toBe(997);
    expect(result.temporaryRemoved).toBe(2);
    expect(storage.delete.mock.calls.map(([key]) => key)).toEqual(
      candidates.filter((key) => !linked.has(key)),
    );
    expect(findMany).toHaveBeenCalledTimes(3);
    expect(findMany.mock.calls.every(([args]) => args.where.storageKey.in.length <= 500)).toBe(
      true,
    );
    expect(storage.purgeTemporaryFiles).toHaveBeenCalledWith(new Date('2030-01-01T11:00:00Z'));
  });

  it('eski ve bağlı olmayan mezun belgesini siler; bağlı ve yeni dosyaları korur', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'mezun-purge-'));
    try {
      const storage = createLocalStorage(root);
      const keys = [
        'graduation/user/orphan.pdf',
        'graduation/user/retained.pdf',
        'graduation/user/new.pdf',
      ];
      for (const key of keys)
        await storage.put(key, new Uint8Array([1]), { contentType: 'application/pdf' });
      const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
      for (const key of keys.slice(0, 2)) await utimes(path.join(root, key), old, old);
      const db = {
        cvUpload: { findFirst: vi.fn().mockResolvedValue(null) },
        graduationDocument: {
          findFirst: vi.fn(async ({ where }: { where: { storageKey: string } }) =>
            where.storageKey === keys[1] ? { id: 'live' } : null,
          ),
        },
      } as unknown as PrismaClient;
      expect((await purgeFiles(db, storage)).graduationRemoved).toBe(1);
      expect(await storage.get(keys[0]!)).toBeNull();
      expect(await storage.get(keys[1]!)).not.toBeNull();
      expect(await storage.get(keys[2]!)).not.toBeNull();
      expect((await purgeFiles(db, storage)).graduationRemoved).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
