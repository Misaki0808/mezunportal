'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Satırlar sürekli döner (kullanıcı kararı, 12 Kas: görünür durdur düğmesi yok). */
const INTERVAL_MS = 3600;
const FADE_MS = 260;
/** Fare ya da klavye odağı bu bölgedeyken satır bekler (kullanıcı okurken kaymaz). */
const HOLD_ZONE = '.landing-hero-copy';
/**
 * Fare bekletmesi YALNIZ gerçek fare/dokunmatik yüzey gibi `hover` destekleyen cihazlarda: telefonda bir kez dokununca
 * `mouseenter` takılı kalır ve satır bir daha dönmezdi (kullanıcı: "o yazı paso değişsin"). Klavye odağı her cihazda bekletir.
 */
const CAN_HOVER = '(hover: hover) and (pointer: fine)';

function getReduced() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function subscribeReduced(notify: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener?.('change', notify);
  return () => media.removeEventListener?.('change', notify);
}
const serverSnapshot = () => false;

/**
 * Dönen satır. Erişilebilirlik (düğme yerine görünmez önlemler): hareketi azaltan kullanıcıda DÖNMEZ (ilk satır sabit); fare
 * kahraman metninin üstündeyken ya da klavye odağı içindeyken BEKLER; ekran okuyucuya canlı bölge olarak duyurulmaz (yalnız
 * ilk satır bir kez okunur, dönen metin `aria-hidden`; başlık anlamı zaten taşır).
 */
export function RotatingLine({ lines }: { lines: readonly string[] }) {
  const root = useRef<HTMLParagraphElement>(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const [held, setHeld] = useState(false);
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, serverSnapshot);

  useEffect(() => {
    const zone = root.current?.closest(HOLD_ZONE);
    if (!zone) return;
    let hover = false;
    let focus = false;
    const sync = () => setHeld(hover || focus);
    const enter = () => {
      hover = true;
      sync();
    };
    const leave = () => {
      hover = false;
      sync();
    };
    const focusIn = () => {
      focus = true;
      sync();
    };
    const focusOut = (event: Event) => {
      // Odak bölge içinde başka bir öğeye geçiyorsa bekleme sürer.
      const next = (event as FocusEvent).relatedTarget;
      focus = next instanceof Node && zone.contains(next);
      sync();
    };
    const canHover = window.matchMedia(CAN_HOVER).matches;
    if (canHover) {
      zone.addEventListener('mouseenter', enter);
      zone.addEventListener('mouseleave', leave);
    }
    zone.addEventListener('focusin', focusIn);
    zone.addEventListener('focusout', focusOut);
    return () => {
      if (canHover) {
        zone.removeEventListener('mouseenter', enter);
        zone.removeEventListener('mouseleave', leave);
      }
      zone.removeEventListener('focusin', focusIn);
      zone.removeEventListener('focusout', focusOut);
    };
  }, []);

  useEffect(() => {
    if (held || reduced || lines.length < 2) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      setVisible(false);
      fade = setTimeout(() => {
        setIndex((current) => (current + 1) % lines.length);
        setVisible(true);
      }, FADE_MS);
    }, INTERVAL_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(fade);
      // Geçiş ortasında beklemeye girilirse (fare/odak) satır görünür kalır; çıkınca gizli takılmaz.
      setVisible(true);
    };
  }, [held, reduced, lines.length]);

  return (
    <p ref={root} className="landing-rotating">
      <span className="sr-only">{lines[0]}</span>
      <span
        aria-hidden="true"
        className="landing-rotating-text"
        data-visible={visible || held || reduced}
      >
        {lines[index]}
      </span>
    </p>
  );
}
