/**
 * Modal/çekmece açıkken arka sayfanın kaymasını kilitler. Yerel `<dialog>.showModal()` arka planı etkisiz kılar ama
 * KAYDIRMAYI durdurmaz: iOS Safari'de örtüye dokunup sürükleyince arkadaki sayfa kayar (ölçüm: WebKit, kart 200).
 *
 * İç içe/art arda açılan pencereler için sayaçlıdır: son pencere kapanınca kilit kalkar. Masaüstünde kaydırma çubuğu
 * kaybolunca düzen kaymasın diye çubuk genişliği kadar sağ boşluk bırakılır.
 */
let locks = 0;
let saved: { htmlOverflow: string; bodyOverflow: string; bodyPaddingRight: string } | null = null;

export function lockScroll(): () => void {
  const root = document.documentElement;
  const body = document.body;
  if (locks === 0) {
    saved = {
      htmlOverflow: root.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };
    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0 && saved) {
      root.style.overflow = saved.htmlOverflow;
      body.style.overflow = saved.bodyOverflow;
      body.style.paddingRight = saved.bodyPaddingRight;
      saved = null;
    }
  };
}
