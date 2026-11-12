'use client';
import { useEffect, useRef } from 'react';

/** Aynı satırın mobil kart/masaüstü tablo kopyalarından yalnız görünür olan odak alır. */
function isVisible(element: HTMLElement) {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    const { display, visibility } = getComputedStyle(current);
    if (display === 'none' || visibility === 'hidden' || visibility === 'collapse') return false;
  }
  return true;
}

/** Başarılı karardan sonra kaldırılan açıcı yerine sıradaki kaydın eylemine devam eder. */
export function useQueueFocus(busy = false) {
  const rootRef = useRef<HTMLDivElement>(null);
  const clearTemporaryFocus = useRef<(() => void) | null>(null);
  useEffect(() => () => clearTemporaryFocus.current?.(), []);
  const waiting = useRef<{ opener: HTMLElement | null; nextIds: string[] } | null>(null);
  function complete(id: string) {
    const rows = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[data-queue-row]') ?? [],
    );
    const ids = [...new Set(rows.map((row) => row.dataset.queueRow!))];
    const index = ids.indexOf(id);
    if (index < 0) return;
    waiting.current = {
      opener: rows
        .find((row) => row.dataset.queueRow === id)!
        .querySelector<HTMLElement>('[data-queue-action]'),
      nextIds: ids.slice(index + 1),
    };
  }
  useEffect(() => {
    const job = waiting.current,
      root = rootRef.current;
    if (busy || !job || !root || root.querySelector('dialog[open]')) return;
    // Sunucu yenilemesi sürerken açıcı hâlâ listededir; Modal'ın kendi dönüşünü ezme.
    if (job.opener?.isConnected && root.contains(job.opener)) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-queue-row]'));
    const nextId = job.nextIds.find((id) => rows.some((row) => row.dataset.queueRow === id));
    const action = rows
      .filter((row) => row.dataset.queueRow === nextId)
      .flatMap((row) => Array.from(row.querySelectorAll<HTMLElement>('[data-queue-action]')))
      .find((element) => !element.matches(':disabled') && isVisible(element));
    const target =
      action ??
      root.querySelector<HTMLElement>('h1,[data-queue-heading]') ??
      root.closest('main')?.querySelector<HTMLElement>('h1') ??
      root;
    if (!action && !target.hasAttribute('tabindex')) {
      clearTemporaryFocus.current?.();
      target.setAttribute('tabindex', '-1');
      const clear = () => {
        target.removeEventListener('blur', clear);
        if (target.getAttribute('tabindex') === '-1') target.removeAttribute('tabindex');
        if (clearTemporaryFocus.current === clear) clearTemporaryFocus.current = null;
      };
      clearTemporaryFocus.current = clear;
      target.addEventListener('blur', clear, { once: true });
    }
    target.focus();
    waiting.current = null;
  });
  return { rootRef, complete };
}
