/**
 * LLM arayüzü (docs/architecture.md "Dış servisler" §2): sağlayıcıdan bağımsız. Servis katmanı yalnız bunu
 * bilir; gerçek adaptör (K-04 cevaplanınca) ve sahte adaptör aynı sözleşmeye uyar.
 *
 * Güven sınırı: adaptör sağlayıcının yapılandırılmış çıktısını OLDUĞU GİBİ (`unknown`) döner; doğrulama ve
 * temizleme servis katmanında `parsedCvSchema` ile yapılır. Gerçek sağlayıcıya yalnız yerelde maskelenmiş
 * metin ve talimat gider; ham PDF yalnız ağ erişimi olmayan sahte sağlayıcıda kullanılır.
 */
export type LlmCvRequest = {
  pdf: Uint8Array;
  /** Yalnız bulunan bölüm türleri; PDF metni veya kişisel veri içermez. */
  sectionHints?: readonly ('experience' | 'education' | 'skills')[];
  /** Sistem talimatı (`prompt.ts`); sağlayıcıdan bağımsız metin. */
  instruction: string;
  /** Beklenen çıktının JSON Şeması (`parsedCvJsonSchema()`). */
  schema: Record<string, unknown>;
  /** Zaman aşımı/iptal; adaptör bunu sağlayıcı çağrısına geçirmelidir. */
  signal: AbortSignal;
};

/** Yalnız maske sonrası metin; ham PDF veya kimlik bu çağrıya girmez. */
export type RedactedCvRequest = Omit<LlmCvRequest, 'pdf'> & { text: string };

export interface LlmAdapter {
  readonly provider: string;
  parseCv(request: LlmCvRequest): Promise<unknown>;
  parseRedactedCv?(request: RedactedCvRequest): Promise<unknown>;
}

/**
 * Kararlı, sızıntısız hata. Sağlayıcının ham yanıtı, istek gövdesi ya da başlığı mesaja GİRMEZ (CV içeriği ve
 * anahtar olabilir). `retryable`: aynı CV yeniden denenirse geçebilir (geçici kesinti, zaman aşımı).
 */
export type LlmErrorCode = 'TIMEOUT' | 'UNAVAILABLE' | 'REJECTED';

export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly retryable: boolean;

  constructor(code: LlmErrorCode) {
    super(`LLM hatası: ${code}`);
    this.name = 'LlmError';
    this.code = code;
    this.retryable = code !== 'REJECTED';
  }
}
