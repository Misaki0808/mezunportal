/**
 * Görünüm (tema) tercihi: üç durum. `system` (varsayılan) cihazın `prefers-color-scheme` ayarını izler,
 * `light` ve `dark` onu ezer. Tercih yalnız tarayıcıdaki `theme` çerezindedir (httpOnly değil, 1 yıl);
 * sunucu `<html data-theme>`'yi bu çerezden yazar, böylece ilk boyama doğru temayla gelir (yanıp sönme yok).
 * Veritabanına yazılmaz, kişisel veri taşımaz.
 */
export const THEME_COOKIE = 'theme';
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const DEFAULT_THEME: Theme = 'system';
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Tarayıcı çubuğu rengi (`<meta name="theme-color">`): açık temada ana renk, koyu temada koyu zemin. */
export const THEME_BROWSER_COLORS = { light: '#5b5bf6', dark: '#0e1a38' } as const;

/** Çerez değerini tema yapar; bilinmeyen, boş ya da bozuk değer `system` olur (sessiz geri dönüş). */
export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? DEFAULT_THEME;
}

/** `document.cookie` benzeri `a=b; theme=dark` dizgisinden tercihi okur. */
export function readThemeFromCookieHeader(header: string | null | undefined): Theme {
  for (const part of (header ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    if (part.slice(0, at).trim() === THEME_COOKIE) return parseTheme(part.slice(at + 1).trim());
  }
  return DEFAULT_THEME;
}

/** İstemcinin yazacağı çerez dizgisi; `Secure` yalnız https'te (yerelde http çalışmak zorunda). */
export function themeCookieString(theme: Theme, secure: boolean): string {
  return `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax${
    secure ? '; Secure' : ''
  }`;
}
