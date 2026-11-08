/**
 * Next.js istek/sunucu eylemi günlüğü (tur bulgusu #12). `next dev` varsayılan olarak sunucu eylemi
 * ARGÜMANLARINI (e-posta, onay e-postası …) ve istek satırını (magic-link `?token=`) terminale yazar; faz sonu
 * telefon testi `dev:lan` ile yapıldığından bu kişisel veri ve giriş jetonu demektir (docs/security.md).
 *  - Sunucu eylemi çağrı günlüğü KAPALI.
 *  - Jeton/doğrulama taşıyan istek satırları yazılmaz; diğer istek satırları (yol + süre) kalır.
 */
export const SENSITIVE_REQUEST_PATTERNS: RegExp[] = [
  /^\/api\/auth\//,
  /[?&](token|code|state|callbackURL)=/i,
  /^\/api\/graduation-documents\//,
];

export const nextLogging = {
  serverFunctions: false,
  incomingRequests: { ignore: SENSITIVE_REQUEST_PATTERNS },
} as const;

/** Test yardımcısı: bu istek satırı günlüğe yazılır mı? */
export function isRequestLogged(url: string): boolean {
  return !SENSITIVE_REQUEST_PATTERNS.some((pattern) => pattern.test(url));
}
