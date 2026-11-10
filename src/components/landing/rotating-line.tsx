'use client';

import { useEffect, useState } from 'react';

const INTERVAL_MS = 5500;
const FADE_MS = 400;

/**
 * Dönen satır: ilk satır sunucudan gelir (JavaScript kapalıyken ve `prefers-reduced-motion`'da sabit kalır); 5,5 sn'de bir yumuşak
 * geçişle sıradakine geçer. Ekran okuyucu yalnız ilk satırı okur (dönen kopya `aria-hidden`).
 */
export function RotatingLine({ lines }: { lines: readonly string[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (lines.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
    };
  }, [lines.length]);

  return (
    <p className="landing-rotating">
      <span className="sr-only">{lines[0]}</span>
      <span aria-hidden="true" className="landing-rotating-text" data-visible={visible}>
        {lines[index]}
      </span>
    </p>
  );
}
