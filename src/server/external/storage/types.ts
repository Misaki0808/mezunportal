/**
 * Dosya depolama arayüzü (docs/architecture.md "Dosya depolama"). Servis katmanı yalnız bunu bilir;
 * yerel sürücü, sahte sürücü (test) ve ileride S3 uyumlu sürücü aynı sözleşmeye uyar. Dosyalar yalnız
 * yetki kontrollü bir rotadan akıtılır; anahtar hiçbir zaman istemciden gelmez.
 */
export interface StorageAdapter {
  /** Dosyayı yazar (aynı anahtar varsa üzerine). Yazma atomiktir: yarım dosya görünmez. */
  put(key: string, data: Uint8Array, meta: { contentType: 'application/pdf' }): Promise<void>;
  /** Dosyayı okur; yoksa `null`. */
  get(key: string): Promise<Uint8Array | null>;
  /** Dosyayı siler; yoksa sessizce geçer (idempotent). */
  delete(key: string): Promise<void>;
}

export class StorageError extends Error {
  constructor(operation: 'put' | 'get' | 'delete', cause?: unknown) {
    // Yol, anahtar ve sistem hata metni mesaja girmez (kullanıcıya/loga sızmasın).
    super(`Depolama işlemi başarısız: ${operation}`, { cause });
    this.name = 'StorageError';
  }
}
