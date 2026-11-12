'use client';
import { useEffect, useRef } from 'react';

/** Başarılı karardan sonra kaldırılan açıcı yerine sıradaki kaydın eylemine devam eder. */
export function useQueueFocus(busy = false) {
  const rootRef = useRef<HTMLDivElement>(null);
  const waiting = useRef<{ opener: HTMLElement | null; nextIds: string[] } | null>(null);
  function complete(id: string) {
    const rows = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>('[data-queue-row]') ?? [],
    );
    const index = rows.findIndex((row) => row.dataset.queueRow === id);
    if (index < 0) return;
    waiting.current = {
      opener: rows[index]!.querySelector<HTMLElement>('[data-queue-action]'),
      nextIds: rows.slice(index + 1).map((row) => row.dataset.queueRow!),
    };
  }
  useEffect(() => {
    const job = waiting.current,
      root = rootRef.current;
    if (busy || !job || !root || root.querySelector('dialog[open]')) return;
    // Sunucu yenilemesi sürerken açıcı hâlâ listededir; Modal'ın kendi dönüşünü ezme.
    if (job.opener?.isConnected && root.contains(job.opener)) return;
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-queue-row]'));
    const next = job.nextIds
      .map((id) => rows.find((row) => row.dataset.queueRow === id))
      .find(Boolean);
    const action = Array.from(
      next?.querySelectorAll<HTMLElement>('[data-queue-action]') ?? [],
    ).find((element) => !element.matches(':disabled'));
    const target =
      action ??
      root.querySelector<HTMLElement>('h1,[data-queue-heading]') ??
      root.closest('main')?.querySelector<HTMLElement>('h1') ??
      root;
    if (!action) target.setAttribute('tabindex', '-1');
    target.focus();
    waiting.current = null;
  });
  return { rootRef, complete };
}
