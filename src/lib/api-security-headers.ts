/**
 * API yanıtlarının güvenlik politikaları (docs/security.md "Güvenlik başlıkları").
 *
 * `next.config.ts` `headers()` rota işleyicisinin kendi `Content-Security-Policy`/`Referrer-Policy` değerlerini EZER
 * (üretim derlemesinde ölçüldü, kart 531); bu yüzden politika yalnız burada tanımlanır, `next.config.ts` uygular ve
 * rota işleyicileri aynı sabiti yazar (iki yerde ayrışamaz; yapılandırma testi etkin başlığı sınar).
 */

/** Varsayılan API politikası: indirme, JSON, görsel ve yönlendirme yanıtları; hiçbir alt kaynak, gömme ya da betik yok. */
export const API_CSP = "default-src 'none'; frame-ancestors 'none'; sandbox";

/**
 * Satır içi (`inline`) PDF gösteren rotalar (mezun belgesi, CV inceleme dosyası). `sandbox` EKLENMEZ: Chrome'da
 * PDF görüntüleyiciyi bozmadığı ölçüldü (kart 533) ama WebKit'te (Safari/iPhone) ölçülemedi (Playwright WebKit PDF'i hiçbir
 * politikada satır içi göstermez, indirir); ölçülmeyen kısıtı öğrencilerin telefonuna yüklememek için konmaz.
 */
export const INLINE_PDF_CSP = "default-src 'none'; frame-ancestors 'none'";

export const API_REFERRER_POLICY = 'no-referrer';

/** Satır içi PDF gösteren rota yolları (Next `source` biçimi); API varsayılanından SONRA uygulanır. */
export const INLINE_PDF_SOURCES = [
  '/api/graduation-documents/:id/file',
  '/api/cv-inceleme/:id/dosya',
] as const;
