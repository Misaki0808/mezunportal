import { randomUUID } from 'node:crypto';

// `graduation/<userId>/<uuid>.pdf`, `cv/<userId>/<uuid>.pdf`. Parçalar yalnız harf, rakam, `_` ve `-`
// taşır: `..`, `/`, `\`, boşluk ve NUL içeremez (yol aşımı yok).
const KEY_PATTERN = /^(graduation|cv)\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.pdf$/;

export function isValidStorageKey(key: string): boolean {
  return (
    KEY_PATTERN.test(key) || /^photo\/[A-Za-z0-9_-]{1,64}\/[0-9a-f-]{36}-(512|96)\.webp$/.test(key)
  );
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

/** Yeni CV anahtarı: `cv/<userId>/<uuid>.pdf`. */
export function newCvKey(userId: string): string {
  const key = `cv/${userId}/${randomUUID()}.pdf`;
  assertValidStorageKey(key);
  return key;
}

/** Ayrı anahtarlar: kullanıcı + tahmin edilemez UUID; dosya adı istemciden gelmez. */
export function newProfilePhotoKeys(userId: string) {
  const id = randomUUID();
  const largeKey = `photo/${userId}/${id}-512.webp`;
  const smallKey = `photo/${userId}/${id}-96.webp`;
  assertValidStorageKey(largeKey);
  assertValidStorageKey(smallKey);
  return { largeKey, smallKey };
}
