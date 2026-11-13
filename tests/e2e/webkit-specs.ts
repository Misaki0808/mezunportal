/**
 * `webkit-*.spec.ts` yalnız Safari (WebKit) projesinde koşar. Playwright `testMatch`/`testIgnore` desenini DOSYANIN MUTLAK
 * YOLUNA uygular: eski `/webkit-.*\.spec\.ts/` deseni, yolunda `webkit-` geçen bir çalışma kopyasında (örn. `worktrees/r1-webkit-p3`)
 * bütün spec'lere uyuyordu. Sonuçları: varsayılan koşuda Chromium projesi her şeyi atlayıp "No tests found" ile düşer
 * (çıkış 1), `E2E_WEBKIT=1`'de ise "yalnız WebKit spec'leri" kapısı bozulup bütün paket (143 test) WebKit'te koşar.
 * Desen bu yüzden dizin adına değil, dosya adının başına (`webkit-`) bağlıdır.
 */
export const WEBKIT_SPEC = /(^|[\\/])webkit-[^\\/]*\.spec\.ts$/;

/** Chromium projesi: `webkit-*.spec.ts` dosyalarını atlar. */
export const chromiumSpecFilter = { testIgnore: WEBKIT_SPEC };

/**
 * WebKit projesinin dosya süzgeci. `E2E_WEBKIT=1`: YALNIZ `webkit-*.spec.ts` (`--project` verilmese bile bütün testler WebKit'e
 * kaymaz). `E2E_WEBKIT=all`: kasıtlı kapı, süzgeç yok (tek tek seçilen spec'ler WebKit'te koşar).
 */
export function webkitSpecFilter(mode: string | undefined) {
  return mode === '1' ? { testMatch: WEBKIT_SPEC } : {};
}
