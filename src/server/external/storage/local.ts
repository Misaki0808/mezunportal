import 'server-only';

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertValidStorageKey, isValidStorageKey } from './keys';
import { StorageError, type StorageAdapter } from './types';

/**
 * Yerel dosya sürücüsü (`.data/files/`, worktree başına). Güvenlik: anahtar sıkı bir desenle doğrulanır
 * ve çözümlenen yol köke hapsedilir; yazma geçici dosya + `rename` ile atomiktir; dosya izinleri 0600.
 */
export function createLocalStorage(rootPath: string): StorageAdapter {
  const root = path.resolve(rootPath);

  function resolveKey(key: string): string {
    assertValidStorageKey(key);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new TypeError('Geçersiz depolama anahtarı');
    return full;
  }

  return {
    async put(key, data) {
      const full = resolveKey(key);
      const temporary = `${full}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
        await writeFile(temporary, data, { mode: 0o600 });
        await rename(temporary, full);
      } catch (cause) {
        await unlink(temporary).catch(() => undefined);
        throw new StorageError('put', cause);
      }
    },

    async get(key) {
      const full = resolveKey(key);
      try {
        return new Uint8Array(await readFile(full));
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw new StorageError('get', cause);
      }
    },

    async listOldGraduationKeys(before) {
      const base = path.join(root, 'graduation');
      const users = await readdir(base, { withFileTypes: true }).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') return [];
          throw new StorageError('get', error);
        },
      );
      const keys: string[] = [];
      for (const user of users) {
        if (!user.isDirectory() || user.isSymbolicLink()) continue;
        const files = await readdir(path.join(base, user.name), { withFileTypes: true });
        for (const file of files) {
          const key = `graduation/${user.name}/${file.name}`;
          if (!file.isFile() || file.isSymbolicLink() || !isValidStorageKey(key)) continue;
          const info = await stat(resolveKey(key)).catch(() => null);
          if (info && info.mtime < before) keys.push(key);
        }
      }
      return keys;
    },

    async delete(key) {
      const full = resolveKey(key);
      try {
        await unlink(full);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw new StorageError('delete', cause);
      }
    },
  };
}
