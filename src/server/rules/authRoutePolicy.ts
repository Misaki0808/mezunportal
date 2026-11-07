/**
 * Better Auth HTTP yüzeyinin BEYAZ LİSTESİ. Better Auth yüzlerce uç açar (admin eklentisinin `impersonate-user`,
 * `set-role`, `remove-user`; `sign-up`, `change-password`, `list-sessions`, doğrudan `sign-in/magic-link` …).
 * Biz bunların hiçbirine istemciden ulaşılmasını istemeyiz: giriş, e-posta değiştirme ve çıkış SUNUCU
 * EYLEMLERİMİZDEN (`auth.api` ile, kendi hız sınırımız ve nötr yanıtımızla) geçer. HTTP'den yalnız
 * kullanıcının e-postadaki/sağlayıcıdaki bağlantıya TIKLAMASIYLA tetiklenen GET uçları açıktır.
 */
const ALLOWED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['/magic-link/verify', new Set(['GET'])],
  ['/verify-email', new Set(['GET'])],
  ['/callback/linkedin', new Set(['GET'])],
]);

/** `pathname` `/api/auth/...` önekli yol ya da önekten sonraki parça olabilir. */
export function isAllowedAuthRoute(pathname: string, method: string): boolean {
  const path = pathname.replace(/^\/api\/auth/, '').replace(/\/+$/, '');
  return ALLOWED.get(path)?.has(method.toUpperCase()) === true;
}
