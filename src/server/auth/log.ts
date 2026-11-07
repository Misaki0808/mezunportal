import 'server-only';

/** Beklenmeyen bir kimlik doğrulama hatasını günlüğe yazar: yalnız işlem adı ve hata TÜRÜ (ileti, değer, adres yok). */
export function logAuthFailure(operation: string, error: unknown): void {
  const kind = error instanceof Error ? error.name : 'bilinmeyen';
  process.stderr.write(`[auth] ${operation} başarısız: ${kind}\n`);
}
