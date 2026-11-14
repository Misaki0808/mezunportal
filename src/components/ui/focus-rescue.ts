/**
 * Eylem sonrası odak kaybı için ortak yardımcı (kart 352). Karar/gönderim düğmesi eylemden sonra kalkar, pasifleşir ya da sayfa
 * değişir; odak `BODY`'ye düşer ve klavye/ekran okuyucu kullanıcısı bir sonraki Tab'da sayfa başına döner.
 *
 * Kalıp: eylemden ÖNCE `captureFocus()`, eylemden SONRA `rescueFocus(tetikleyici)`. Odak gerçekten kaybolduysa:
 *  - tetikleyici hâlâ sayfadaysa ve kullanılabilirse ona döner,
 *  - tetikleyici kalktıysa ya da kalıcı pasifse sonuç hedefine gider: `[data-focus-result]`, yoksa `main h1`, yoksa `main`.
 * Odak başka bir öğedeyse (iletişim penceresi kendi dönüşünü yaptı, kullanıcı başka yere geçti) hiçbir şey yapmaz. Fare/dokunmada
 * hiçbir şey odakta değilse (`captureFocus` `null`) kurtarılacak klavye bağlamı yoktur ve yardımcı hiçbir şey yapmaz.
 */

const POLL_MS = 60;
const DEFAULT_TIMEOUT_MS = 3500;
/** Tetikleyici bu kadar yoklama boyunca pasif kalırsa kalıcı pasif sayılır (gönderim bitti, düğme "bitti" durumunda kaldı). */
const SETTLED_DISABLED_TICKS = 3;
/** Başlık bu süreye kadar gelmediyse son çare olarak ana alana odaklanılır. */
const MAIN_FALLBACK_MS = 1000;

/** Eylem başlarken odaktaki öğeyi alır; hiçbir şey odakta değilse `null`. */
export function captureFocus(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

function focusable(element: HTMLElement): boolean {
  return element.matches('input,select,textarea,button,a[href],[tabindex]');
}

/** Odaklanabilir olmayan öğeye (başlık, durum metni) geçici `tabindex=-1` verir; odak çıkınca kaldırır. */
export function focusElement(element: HTMLElement): void {
  if (!focusable(element)) {
    element.setAttribute('tabindex', '-1');
    element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true });
  }
  element.focus();
}

/**
 * Sonuç hedefi: sayfanın işaretlediği öğe, yoksa ana başlık, yoksa (`allowMain`) ana alan. Sayfa değişirken yükleme iskeleti
 * `main` taşır ama `h1` taşımaz: `rescueFocus` başlık gelene kadar bekler, ana alana ancak süre dolmaya yakın düşer.
 */
export function resultTarget(allowMain = true): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-focus-result]:not([hidden])') ??
    document.querySelector<HTMLElement>('main h1') ??
    (allowMain ? document.querySelector<HTMLElement>('main') : null)
  );
}

/** İlk hatalı alana odak (alan bazlı hata; ekran okuyucu `aria-describedby` ile hata metnini okur). */
export function focusFirstInvalid(root: ParentNode | null | undefined = document): boolean {
  const field = root?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!field) return false;
  field.focus();
  return true;
}

function usable(trigger: HTMLElement): boolean {
  if (!trigger.isConnected || trigger.matches(':disabled')) return false;
  return typeof trigger.checkVisibility === 'function' ? trigger.checkVisibility() : true;
}

export type RescueOptions = {
  /** Sonuç hedefini sayfaya göre seçer; verilmezse `resultTarget()`. */
  target?: () => HTMLElement | null;
  timeoutMs?: number;
};

let cancelPrevious: (() => void) | undefined;

/**
 * Eylem bittikten sonra odağı izler (kısa süre yoklar). Odak kaybolursa (`BODY`) tetikleyiciye ya da sonuç hedefine taşır;
 * başka bir öğe odağı aldıysa durur. Sayfa değişimi (`router.push`) eylemden SONRA tamamlandığı için yoklama süresi boyunca
 * sürer: düğme kalkınca yeni sayfanın başlığına gider.
 */
export function rescueFocus(trigger: HTMLElement | null, options: RescueOptions = {}): void {
  if (!trigger || typeof window === 'undefined') return;
  cancelPrevious?.();
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let holder: HTMLElement = trigger;
  let disabledTicks = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
  cancelPrevious = stop;
  const toTarget = () => {
    const target = options.target?.() ?? resultTarget(Date.now() >= deadline - MAIN_FALLBACK_MS);
    if (target) {
      focusElement(target);
      stop(); // Hedefe varıldı: iş bitti (yeni sayfada tekrar kurtarma yapılmaz).
    }
  };
  const tick = () => {
    if (stopped) return;
    const active = document.activeElement;
    // Başka bir öğe odakta: pencere kendi dönüşünü yaptı ya da kullanıcı başka yere geçti.
    if (active && active !== document.body && active !== holder) return stop();
    const lost = active === document.body || !holder.isConnected;
    if (lost) {
      if (usable(trigger)) {
        trigger.focus();
        holder = trigger;
        disabledTicks = 0;
      } else if (!trigger.isConnected) {
        toTarget();
      } else {
        // Bağlı ama pasif: yeni durumun yerleşmesini bekle, kalıcıysa sonuca git.
        disabledTicks += 1;
        if (disabledTicks >= SETTLED_DISABLED_TICKS) toTarget();
      }
    }
    if (Date.now() < deadline) timer = setTimeout(tick, POLL_MS);
    else stop();
  };
  timer = setTimeout(tick, POLL_MS);
}
