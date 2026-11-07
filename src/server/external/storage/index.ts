import 'server-only';

import { getStorageEnv } from '@/lib/env';

import { createLocalStorage } from './local';
import type { StorageAdapter } from './types';

export { StorageError } from './types';
export type { StorageAdapter } from './types';
export { isValidStorageKey, newGraduationDocumentKey } from './keys';
export { createLocalStorage } from './local';
export { createMemoryStorage } from './memory';

let cached: StorageAdapter | undefined;

/** Env'e göre sürücü (tembel; import anında env okunmaz). Testler sahte sürücüyü doğrudan enjekte eder. */
export function getStorage(): StorageAdapter {
  if (!cached) {
    const env = getStorageEnv();
    cached = createLocalStorage(env.STORAGE_LOCAL_PATH);
  }
  return cached;
}
