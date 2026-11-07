import { assertValidStorageKey } from './keys';
import { StorageError, type StorageAdapter } from './types';

/** Test için sahte sürücü: bellekte tutar; hata senaryoları `failures` ile üretilir. */
export type MemoryStorage = StorageAdapter & {
  readonly files: Map<string, Uint8Array>;
  /** `true` iken ilgili işlem `StorageError` fırlatır (zaman aşımı/hata yolu testi). */
  failures: { put: boolean; get: boolean; delete: boolean };
};

export function createMemoryStorage(): MemoryStorage {
  const files = new Map<string, Uint8Array>();
  const failures = { put: false, get: false, delete: false };

  return {
    files,
    failures,
    async put(key, data) {
      assertValidStorageKey(key);
      if (failures.put) throw new StorageError('put');
      files.set(key, new Uint8Array(data));
    },
    async get(key) {
      assertValidStorageKey(key);
      if (failures.get) throw new StorageError('get');
      const found = files.get(key);
      return found ? new Uint8Array(found) : null;
    },
    async delete(key) {
      assertValidStorageKey(key);
      if (failures.delete) throw new StorageError('delete');
      files.delete(key);
    },
  };
}
