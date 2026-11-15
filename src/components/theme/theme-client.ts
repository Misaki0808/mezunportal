import { THEME_BROWSER_COLORS, parseTheme, themeCookieString, type Theme } from '@/lib/theme';

/**
 * Görünüm tercihinin tarayıcı tarafı (kart 383). Tek doğru kaynak `<html data-theme>` özniteliğidir: sunucu ilk boyamada
 * çerezden yazar, burası düğmeye basılınca çerezi ve özniteliği birlikte günceller. Bileşenler özniteliği dinler
 * (`useSyncExternalStore`), böylece üst çubuktaki düğme ile hesap sayfasındaki seçim birbirinden sapmaz.
 */
export type EffectiveTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';
/** Geçiş sınıfının html üzerinde kaldığı süre (CSS geçişi 180 ms). */
const TRANSITION_MS = 250;

function systemMedia(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
}

/** Elle ya da sistem: öznitelikteki seçim; yok ya da bozuksa `system`. */
export function getDocumentTheme(): Theme {
  return parseTheme(document.documentElement.getAttribute('data-theme'));
}

/** Ekranda şu an görünen tema: `system` ise cihazın ayarına bakılır. */
export function getEffectiveTheme(): EffectiveTheme {
  const theme = getDocumentTheme();
  if (theme !== 'system') return theme;
  return systemMedia()?.matches ? 'dark' : 'light';
}

export function subscribeTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const media = systemMedia();
  media?.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media?.removeEventListener('change', onChange);
  };
}

/**
 * Tarayıcı çubuğu rengi: `system` iken her `<meta name="theme-color">` kendi medya koşulundaki rengi alır (sunucunun yazdığı
 * iki etiket); elle seçimde hepsi seçilen temanın rengini taşır.
 */
export function applyBrowserColor(theme: Theme): void {
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = (meta.getAttribute('media') ?? '').includes('dark') ? 'dark' : 'light';
    meta.setAttribute('content', THEME_BROWSER_COLORS[theme === 'system' ? own : theme]);
  }
}

/** Tercihi kaydeder (çerez) ve hemen uygular. Veritabanına yazılmaz. */
export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === theme) return;
  try {
    document.cookie = themeCookieString(theme, window.location.protocol === 'https:');
  } catch {
    // Çerez yazılamıyorsa (engelli tarayıcı) bu oturumda yine uygulanır; kalıcılık yoktur.
  }
  // Kısa renk geçişi yalnız elle değişimde (ilk boyamada yok); hareketi azaltan kullanıcıda CSS tarafı kapalı.
  root.classList.add('theme-transition');
  root.setAttribute('data-theme', theme);
  applyBrowserColor(theme);
  window.setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS);
}
