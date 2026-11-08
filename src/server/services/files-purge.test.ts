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
