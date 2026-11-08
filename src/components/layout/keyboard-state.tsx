'use client';

import { useEffect } from 'react';

/** Bu kadar px'ten fazla küçülen görsel görünüm alanı ekran klavyesi sayılır (adres çubuğu animasyonu ~100 px'in altındadır). */
const KEYBOARD_MIN_SHRINK = 140;
const EDITABLE =
  'input:not([type=checkbox]):not([type=radio]):not([type=button]), textarea, select, [contenteditable=true]';

/** Odaktaki öğe metin girişi mi? (Klavye yalnız o zaman anlamlıdır; seçim/onay kutusu için klavye açılmaz.) */
export function isEditing(element: Element | null): boolean {
  return element instanceof HTMLElement && element.matches(EDITABLE);
}

/**
 * Ekran klavyesi durumunu `<html data-keyboard="open">` olarak yayar (`visualViewport`): açıkken alt gezinme gizlenir ve
 * yapışkan eylem çubukları (`.sticky-actions`) akışa döner; böylece klavye + gezinme + çubuk yazma alanını ezmez, eylemler
 * formun sonunda kaydırılarak erişilebilir kalır. Görsel görünüm alanı API'si yoksa hiçbir şey yapmaz.
 */
export function KeyboardState() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      const shrink = window.innerHeight - viewport.height;
      if (shrink > KEYBOARD_MIN_SHRINK && isEditing(document.activeElement))
        root.dataset.keyboard = 'open';
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
