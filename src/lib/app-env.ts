/**
 * Geliştirme araçlarına (örn. `/ui-ornekleri`) yalnız `local` ve `test` ortamında izin verilir.
 * Güvenli taraf: `APP_ENV` tanımsız, hatalı ya da `prod` ise KAPALI (hata verip açık kalmaz).
 * Sayfa her istekte değerlendirilir (`dynamic = 'force-dynamic'`); derleme anındaki env'e bağlı kalmaz.
 */
export function isDevToolsEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.APP_ENV === 'local' || env.APP_ENV === 'test';
}
