/**
 * Dosya depolama arayüzü (docs/architecture.md "Dosya depolama"). Servis katmanı yalnız bunu bilir;
 * yerel sürücü, sahte sürücü (test) ve ileride S3 uyumlu sürücü aynı sözleşmeye uyar. Dosyalar yalnız
 * yetki kontrollü bir rotadan akıtılır; anahtar hiçbir zaman istemciden gelmez.
 */
export interface StorageAdapter {
  /** Dosyayı yazar (aynı anahtar varsa üzerine). Yazma atomiktir: yarım dosya görünmez. */
  put(
    key: string,
    data: Uint8Array,
    meta: { contentType: 'application/pdf' | 'image/webp' },
  ): Promise<void>;
  /** Dosyayı okur; yoksa `null`. */
  get(key: string): Promise<Uint8Array | null>;
  /** Dosyayı siler; yoksa sessizce geçer (idempotent). */
  delete(key: string): Promise<void>;
  /** Belirtilen tarihten eski mezun belgeleri (temizlik işinin sunucu içi taraması). */
  listOldGraduationKeys?(before: Date): Promise<string[]>;
  /** Belirtilen tarihten eski CV dosyaları. */
  listOldCvKeys?(before: Date): Promise<string[]>;
  /** CV/mezun belgesi yazımından kalan eski geçici dosyalar; yeni yazım ve diğer dosyalar korunur. */
  purgeTemporaryFiles?(before: Date): Promise<number>;
}

export class StorageError extends Error {
  constructor(operation: 'put' | 'get' | 'delete', cause?: unknown) {
    // Yol, anahtar ve sistem hata metni mesaja girmez (kullanıcıya/loga sızmasın).
    super(`Depolama işlemi başarısız: ${operation}`, { cause });
    this.name = 'StorageError';
  }
}
