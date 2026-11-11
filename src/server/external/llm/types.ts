/**
 * LLM arayüzü (docs/architecture.md "Dış servisler" §2): sağlayıcıdan bağımsız. Servis katmanı yalnız bunu
 * bilir; gerçek adaptör (K-04 cevaplanınca) ve sahte adaptör aynı sözleşmeye uyar.
 *
 * Güven sınırı: adaptör sağlayıcının yapılandırılmış çıktısını OLDUĞU GİBİ (`unknown`) döner; doğrulama ve
 * temizleme servis katmanında `parsedCvSchema` ile yapılır. Adaptöre araç/çağrı yetkisi verilmez ve yalnız
 * PDF baytları ile talimat gider — kullanıcı kimliği, e-posta, rol vb. HİÇBİR ZAMAN modele iletilmez.
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

export interface LlmAdapter {
  readonly provider: string;
  parseCv(request: LlmCvRequest): Promise<unknown>;
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
