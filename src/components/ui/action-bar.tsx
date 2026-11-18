'use client';

import { useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';

const VAR = '--action-bar-h';
/** Ekranda bağlı bütün çubukların yüksekliği; değişken en yükseğini taşır (bir sayfada genelde tek çubuk vardır). */
const heights = new Map<Element, number>();

function publish() {
  const root = document.documentElement;
  const tallest = Math.max(0, ...heights.values());
  if (tallest > 0) root.style.setProperty(VAR, `${tallest}px`);
  else root.style.removeProperty(VAR);
}

/**
 * Telefonda alt gezinmenin üstüne yapışan eylem çubuğu (Devam et, Kaydet, Gönder, …). Çubuk kendi yüksekliğini
 * `--action-bar-h` değişkenine yazar (bağlanınca yazılır, boyu değişince güncellenir, kalkınca silinir); ortak toast bölgesi
 * alt konumunu bu değişkenle CSS'te hesaplar ve çubuğun düğmelerini örtmez. Ölçüm kaydırmaya ya da olaylara bağlı değildir,
 * rota değişimi bileşenin bağlanıp kalkmasıyla kendiliğinden çözülür (kart 453). Yeni yapışkan alt kap bu bileşeni kullanmalı.
 * `enabled={false}` aynı kabı çubuk olmadan çizer (örn. etkinlikte katılım doğrulandıktan sonra).
 */
export function ActionBar({
  enabled = true,
  children,
  ...rest
}: ComponentProps<'div'> & { enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;
    const measure = () => {
      heights.set(node, Math.ceil(node.getBoundingClientRect().height));
      publish();
    };
    measure();
    let stop: () => void;
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      stop = () => window.removeEventListener('resize', measure);
    } else {
      const observer = new ResizeObserver(measure);
      observer.observe(node, { box: 'border-box' });
      stop = () => observer.disconnect();
    }
    return () => {
      stop();
      heights.delete(node);
      publish();
    };
  }, [enabled]);
  return (
    <div ref={ref} data-action-bar={enabled ? '' : undefined} {...rest}>
      {children}
    </div>
  );
}
