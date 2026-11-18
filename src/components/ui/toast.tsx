'use client';

import { useTranslations } from 'next-intl';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';

import { cn } from './cn';
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from './icons';
import { IconButton } from './icon-button';

export type ToastTone = 'info' | 'success' | 'error';
export type ToastInput = { message: string; tone?: ToastTone };
type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastApi = { show: (toast: ToastInput) => void; dismiss: (id: number) => void };

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER_MS = 6000;
/** Telefonda alta yapışan eylem çubukları `data-action-bar` taşır; toast onların üstüne kalkar (örtmez). */
const ACTION_BAR = '[data-action-bar]';
const LIFT = '--toast-lift';

/**
 * Toast bölgesi alt gezinmenin hemen üstünde durur; yapışkan eylem çubukları (Devam et, Kaydet, …) aynı şeridi tutar ve
 * birincil düğmeyi örterdi. Bölge, ekranda görünen çubukla çakışıyorsa çubuğun üstüne kaldırılır. Bilgisayarda (`lg`)
 * çubuklar akışta olduğu için kaldırma yoktur.
 */
function liftAboveActionBars(region: HTMLElement) {
  region.style.setProperty(LIFT, '0px');
  if (window.matchMedia?.('(min-width: 1024px)').matches) return;
  const box = region.getBoundingClientRect();
  if (box.height === 0) return;
  let lift = 0;
  for (const bar of document.querySelectorAll(ACTION_BAR)) {
    const rect = bar.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > box.top && rect.top < box.bottom)
      lift = Math.max(lift, box.bottom - rect.top + 8);
  }
  region.style.setProperty(LIFT, `${Math.ceil(lift)}px`);
}
const TONE_STYLES: Record<ToastTone, string> = {
  info: 'border-primary bg-primary-soft text-on-primary-soft',
  success: 'border-success bg-success-soft text-on-success-soft',
  error: 'border-danger bg-danger-soft text-on-danger-soft',
};
const TONE_ICONS: Record<ToastTone, ReactNode> = {
  info: <InfoIcon />,
  success: <CheckIcon />,
  error: <AlertIcon />,
};

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast, ToastProvider içinde kullanılmalı');
  return context;
}

/**
 * Bildirimler iki kalıcı canlı bölgede gösterilir (bölge önceden DOM'da olduğundan ekran okuyucu
 * eklenen metni duyurur): bilgi/başarı kibar (`status`), hata anında (`alert`).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('ui.toast');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const items = useRef<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const region = useRef<HTMLDivElement>(null);

  const commit = useCallback((next: ToastItem[]) => {
    items.current = next;
    setToasts(next);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      commit(items.current.filter((toast) => toast.id !== id));
    },
    [commit],
  );

  const show = useCallback(
    ({ message, tone = 'info' }: ToastInput) => {
      // Ardışık iki eylem aynı iletiyi verirse ("Talep güncellendi." iki kez) iki kutu yığılmaz: eskisi kalkar, yenisi gelir
      // (yeni ileti yine duyurulur, süre yeniden başlar).
      const same = items.current.find((toast) => toast.message === message && toast.tone === tone);
      if (same) {
        const timer = timers.current.get(same.id);
        if (timer) clearTimeout(timer);
        timers.current.delete(same.id);
      }
      const id = nextId.current++;
      commit([...items.current.filter((toast) => toast !== same), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [commit, dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => {
      active.forEach((timer) => clearTimeout(timer));
      active.clear();
    };
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  useLayoutEffect(() => {
    const node = region.current;
    if (!node) return;
    if (toasts.length === 0) {
      node.style.removeProperty(LIFT);
      return;
    }
    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => liftAboveActionBars(node));
    };
    liftAboveActionBars(node);
    window.addEventListener('scroll', place, { capture: true, passive: true });
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', place, { capture: true });
      window.removeEventListener('resize', place);
    };
  }, [toasts]);

  function renderToast(toast: ToastItem) {
    return (
      <div
        key={toast.id}
        className={cn(
          'toast-in pointer-events-auto flex items-start gap-3 rounded-control border-l-4 p-3 shadow-overlay',
          TONE_STYLES[toast.tone],
        )}
      >
        <span className="mt-0.5 shrink-0">{TONE_ICONS[toast.tone]}</span>
        <p className="flex-1 pt-0.5 text-base">{toast.message}</p>
        <IconButton
          label={t('dismiss')}
          icon={<CloseIcon />}
          onClick={() => dismiss(toast.id)}
          className="-my-2 -mr-2"
        />
      </div>
    );
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        ref={region}
        aria-label={t('region')}
        role="region"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom)+var(--toast-lift,0px))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        <div role="status" aria-live="polite" className="flex w-full max-w-md flex-col gap-2">
          {toasts.filter((toast) => toast.tone !== 'error').map(renderToast)}
        </div>
        <div role="alert" className="flex w-full max-w-md flex-col gap-2">
          {toasts.filter((toast) => toast.tone === 'error').map(renderToast)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
