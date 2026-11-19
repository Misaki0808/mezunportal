import type { Page } from '@playwright/test';

/** Yalnız yerel Next geliştirme hata katmanının kendi CORS tanılama hatası. */
function isNextDevStackFrameError(message: string, pageUrl: string) {
  const full = /^Fetch API cannot load (https?:\/\/\S+) due to access control checks\.$/.exec(
    message,
  );
  // WebKit, hata türü öneki olmayan iletide http: öncesini kesebiliyor; 462'de görülen biçim.
  const clipped = /^(\/(?:127\.0\.0\.1|localhost):\d+\/\S+) due to access control checks\.$/.exec(
    message,
  );
  const address = full?.[1] ?? (clipped ? `http:/${clipped[1]}` : undefined);
  if (!address) return false;
  try {
    const diagnostic = new URL(address);
    return (
      ['127.0.0.1', 'localhost'].includes(diagnostic.hostname) &&
      diagnostic.origin === new URL(pageUrl).origin &&
      diagnostic.pathname === '/__nextjs_original-stack-frames'
    );
  } catch {
    return false;
  }
}

/** Gerçek sayfa hataları korunur; genel fetch/CORS/TypeError filtrelenmez. */
export function watchPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (!isNextDevStackFrameError(error.message, page.url())) errors.push(error.message);
  });
  return errors;
}
