'use client';

import { useEffect } from 'react';

/** Bu kadar px'ten fazla küçülen görünür alan ekran klavyesi sayılır (adres çubuğu animasyonu ~100 px'in altındadır). */
const KEYBOARD_MIN_SHRINK = 140;
const EDITABLE =
  'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable=true]';

/** Odaktaki öğe metin girişi mi? (Klavye yalnız o zaman anlamlıdır; seçim/onay kutusu için klavye açılmaz.) */
export function isEditing(element: Element | null): boolean {
  return element instanceof HTMLElement && element.matches(EDITABLE);
}

/**
 * Ekran klavyesi durumunu `<html data-keyboard="open">` olarak yayar: açıkken alt gezinme gizlenir ve yapışkan eylem
 * çubukları (`.sticky-actions`) akışa döner; böylece klavye + gezinme + çubuk yazma alanını ezmez, eylemler formun
 * sonunda kaydırılarak erişilebilir kalır.
 *
 * Ölçüt "klavyesiz görünür yükseklik − şimdiki görünür yükseklik"tir. Klavyesiz yükseklik (`baseline`), metin girişi
 * odakta DEĞİLKEN görülen `visualViewport.height`'tir. Neden `innerHeight` değil: iOS Safari klavyede yalnız görsel
 * görünüm alanını küçültür (`innerHeight` sabit), Android Chrome ise yerleşim görünümünü de küçültür (`innerHeight` ve
 * `visualViewport.height` birlikte düşer → fark ≈ 0 olurdu). Kendi tabanımızı tutmak iki davranışta da çalışır. Genişlik
 * değişince (yatay/dikey çevirme, bölünmüş ekran) taban yeniden alınır. Görsel görünüm alanı API'si yoksa hiçbir şey yapmaz.
 */
export function KeyboardState() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    let baseline = viewport.height;
    let width = viewport.width;
    const update = () => {
      if (viewport.width !== width) {
        // Çevirme / bölünmüş ekran: yeni yönün klavyesiz yüksekliği taban olur.
        width = viewport.width;
        baseline = viewport.height;
      } else {
        // Taban yalnız büyür (en yüksek görünür yükseklik): klavye açıkken ya da odak alanlar arasında geçerken
        // (focusout → focusin arası) küçülmüş değer asla taban olmaz. Adres çubuğu oynaması 140 px'in altındadır.
        baseline = Math.max(baseline, viewport.height);
      }
      // Yakınlaştırılmış sayfada (çimdik) görünür alan klavyesiz de küçülür: o durum klavye sayılmaz.
      const zoomed = viewport.scale !== undefined && viewport.scale > 1.01;
      const open =
        !zoomed &&
        isEditing(document.activeElement) &&
        baseline - viewport.height > KEYBOARD_MIN_SHRINK;
      if (open) root.dataset.keyboard = 'open';
      else delete root.dataset.keyboard;
    };
    viewport.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();
    return () => {
      viewport.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      delete root.dataset.keyboard;
    };
  }, []);
  return null;
}
