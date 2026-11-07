import { randomUUID } from 'node:crypto';

// `graduation/<userId>/<uuid>.pdf`, `cv/<userId>/<uuid>.pdf`. Parçalar yalnız harf, rakam, `_` ve `-`
// taşır: `..`, `/`, `\`, boşluk ve NUL içeremez (yol aşımı yok).
const KEY_PATTERN = /^(graduation|cv)\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.pdf$/;

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function assertValidStorageKey(key: string): void {
  if (!isValidStorageKey(key)) throw new TypeError('Geçersiz depolama anahtarı');
}

/** Yeni mezun belgesi anahtarı. Kullanıcı kimliği anahtar biçimine uymuyorsa hata verir. */
export function newGraduationDocumentKey(userId: string): string {
  const key = `graduation/${userId}/${randomUUID()}.pdf`;
  assertValidStorageKey(key);
  return key;
}
