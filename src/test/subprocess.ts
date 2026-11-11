import { spawnSync } from 'node:child_process';

/**
 * Alt süreç başlatan bekçi testleri (react-server koşulunda `node --import tsx`) için ortak süreler. Birim projesinin varsayılan test
 * süresi 5 sn'dir; yük altında (birleştirme kapısında başka işler çalışırken) `tsx` yükleyicisinin ilk açılışı bunu aşabiliyor ("alt süreç geç
 * açılıyor"). Testin süresi alt sürecin süresinden BÜYÜKTÜR: alt süreç zaman aşımı gerçek hatayı anlamlı biçimde bildirir.
 */
export const SUBPROCESS_TEST_TIMEOUT_MS = 30_000;
export const SUBPROCESS_TIMEOUT_MS = 25_000;

let warmed = false;
/** Tek seferlik ısınma: yükleyici ve dosya önbelleği bir kez ısınır; asıl test ısınma süresine takılmaz. */
export function warmUpSubprocess(): void {
  if (warmed) return;
  spawnSync(process.execPath, ['--conditions=react-server', '--import', 'tsx', '-e', '0'], {
    cwd: process.cwd(),
    timeout: SUBPROCESS_TIMEOUT_MS,
  });
  warmed = true;
}
