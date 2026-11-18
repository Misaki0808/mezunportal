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
 * Telefonda (< lg) çubuğu ekranın alt şeridine SABİTLER: alt gezinmenin hemen üstünde (`--bottom-nav-height`, yoksa 4,5 rem +
 * güvenli alan), kaydırmadan bağımsız her zaman aynı yerde. `sticky` kendi üst kabının sonunu geçemediği için sayfa sonunda
 * çubuğu 96–120 px yukarıda bırakıyordu (R2 455 B4). İçerik çubuğun altında kalmasın diye ana alanın alt dolgusu çubuk
 * yüksekliği (`--action-bar-h`) kadar artar (`AppShellClient`): çubuğun altına DÜŞEN içerik (formdan sonra gelen bağlantılar)
 * da sayfa sonunda çubuğun üstünde kalır; akışta çubuk yerinde bir boşluk bırakmak bunu sağlamıyordu (kart 477). Ekran
 * klavyesi açıkken (`html[data-keyboard=open]`, `KeyboardState`) çubuk akışa döner: sabit çubuk iOS'ta klavyenin üstünde
 * zıplamaz, eylemler formun sonunda erişilebilir kalır. lg ve üstünde kap `display: contents`: çubuk, çağıranın
 * sınıflarıyla, eskisi gibi akışta (ya da çağıranın `lg:sticky`'siyle) durur.
 */
const FRAME = [
  'pointer-events-none fixed inset-x-0 z-20 border-t border-border bg-bg px-4 [&>*]:pointer-events-auto',
  'bottom-[max(calc(4.5rem+env(safe-area-inset-bottom)),var(--bottom-nav-height,0px))]',
  '[[data-no-nav]_&]:bottom-[env(safe-area-inset-bottom)]',
  'lg:pointer-events-auto lg:contents',
  '[:root[data-keyboard=open]_&]:pointer-events-auto [:root[data-keyboard=open]_&]:static [:root[data-keyboard=open]_&]:border-t-0 [:root[data-keyboard=open]_&]:bg-transparent [:root[data-keyboard=open]_&]:px-0',
].join(' ');

/**
 * Telefonda alt gezinmenin üstündeki eylem çubuğu (Devam et, Kaydet, Gönder, …). Çubuk kendi yüksekliğini `--action-bar-h`
 * değişkenine yazar (bağlanınca yazılır, boyu değişince güncellenir, kalkınca silinir); ana alanın alt dolgusu ve ortak toast
 * bölgesi bu değişkenle CSS'te konumlanır, toast çubuğun düğmelerini örtmez. Ölçüm kaydırmaya ya da olaylara bağlı değildir, rota
 * değişimi bileşenin bağlanıp kalkmasıyla kendiliğinden çözülür (kart 453). Yeni alt çubuk bu bileşeni kullanmalı; çağıran
 * `sticky`/`fixed`/`bottom-*` vermez (kap verir), yalnız görünüm sınıflarını (`bg`, dolgu, …) ve gerekirse `lg:` davranışını
 * verir. `enabled={false}` aynı içeriği kapsız, çubuk olmadan çizer (örn. etkinlikte katılım doğrulandıktan sonra).
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
  if (!enabled) return <div {...rest}>{children}</div>;
  return (
    <div data-action-bar-frame="" className={FRAME}>
      <div ref={ref} data-action-bar="" {...rest}>
        {children}
      </div>
    </div>
  );
}
