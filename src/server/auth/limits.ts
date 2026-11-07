/**
 * Hız sınırları (docs/security.md “Kötüye kullanım sınırları”). Sabit pencere; anahtarlar
 * `rate-limit.ts`'te e-posta/kimlik özetiyle kurulur (ham e-posta saklanmaz).
 */
export type RateLimitRule = { readonly max: number; readonly windowSeconds: number };

export const AUTH_LIMITS = {
  /** E-postaya giriş bağlantısı: bir adrese saatte en fazla 5 (posta bombardımanını keser). */
  magicLinkPerEmail: { max: 5, windowSeconds: 3600 },
  /** Aynı istemci adresinden saatte en fazla 20 (adres başlıkla taklit edilebilir; tamamlayıcıdır). */
  magicLinkPerIp: { max: 20, windowSeconds: 3600 },
  /** E-posta değiştirme isteği: kullanıcı başına saatte 3. */
  emailChangePerUser: { max: 3, windowSeconds: 3600 },
  /** Mezun belgesi yükleme: kullanıcı başına saatte 5. */
  documentUploadPerUser: { max: 5, windowSeconds: 3600 },
  /** LinkedIn başlatma: istemci adresi başına saatte 30. */
  linkedInStartPerIp: { max: 30, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;
