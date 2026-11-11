'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';

import { cn } from './cn';
import { lockScroll } from './scroll-lock';
import { CloseIcon } from './icons';
import { IconButton } from './icon-button';

export type DialogProps = {
  open: boolean;
  /** Kapatma isteği (Esc, kapat düğmesi, dışına tıklama). Durumu çağıran günceller. */
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Eylem düğmeleri (örn. Kaydet / Vazgeç). */
  footer?: ReactNode;
};

type Placement = 'modal' | 'sheet';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Pencere içindeki görünür, odaklanabilir öğeler (belge sırasıyla). */
function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => {
    if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('dialog') !== root)
      return false;
    for (let node: HTMLElement | null = element; node && node !== root; node = node.parentElement) {
      if (node.hidden || node.hasAttribute('inert')) return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  });
}

const PLACEMENT_CLASSES: Record<Placement, string> = {
  // Mobilde alt sayfa, ≥ 768 px'te ortada pencere
  modal:
    'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none rounded-t-sheet ' +
    'md:inset-0 md:m-auto md:max-h-[85dvh] md:max-w-lg md:rounded-sheet',
  // Mobilde alt sayfa, ≥ 768 px'te sağ yan panel
  sheet:
    'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none rounded-t-sheet ' +
    'md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:h-dvh md:w-full md:max-w-md md:rounded-none',
};

function BaseDialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  placement,
}: DialogProps & { placement: Placement }) {
  const t = useTranslations('ui.dialog');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Yerel <dialog>: showModal() odağı içeri alır (odak tuzağı), arka planı etkisiz kılar ve Esc ile
  // kapanır. Açılmadan önceki odak kapanınca geri verilir.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocusRef.current = document.activeElement;
      dialog.showModal();
      // showModal() odağı belgedeki İLK öğeye, yani başlıktaki "Kapat" düğmesine verir. İlk odak anlamlı olsun: içerikteki
      // (ya da altbilgideki) ilk alan/düğme; hiç yoksa "Kapat"ta kalır. Odak zaten içerikteyse (autofocus niteliği) dokunulmaz.
      const header = headerRef.current;
      if (header?.contains(document.activeElement))
        focusableIn(dialog)
          .find((element) => !header.contains(element))
          ?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    if (!open && returnFocusRef.current instanceof HTMLElement) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  // Açıkken arka sayfa kaymaz (iOS Safari'de örtü üstünde sürükleme sayfayı kaydırırdı).
  useEffect(() => {
    if (!open) return;
    return lockScroll();
  }, [open]);

  // Safari varsayılan Tab sırasında bazı düğme ve bağlantıları atlar; tarayıcı sırasına güvenmeden
  // tüm görünür denetimler arasında odağı kendimiz dolaştırırız.
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (event.target instanceof Element && event.target.closest('dialog') !== dialog) return;
    const items = focusableIn(dialog);
    event.preventDefault();
    if (items.length === 0) {
      dialog.focus();
      return;
    }
    const active = document.activeElement;
    const index = items.findIndex((item) => item === active);
    const next =
      index === -1
        ? event.shiftKey
          ? items.length - 1
          : 0
        : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;
    items[next]?.focus();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    // Dışına (örtüye) tıklama: hedef <dialog>'un kendisidir.
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        // Esc: tarayıcının kendiliğinden kapatmasını durdur; durumu çağıran yönetir.
        event.preventDefault();
        onClose();
      }}
      onClose={(event) => {
        // Tarayıcı yine de kapattıysa (örn. ikinci Esc) durum eşitlenir.
        if (event.target === event.currentTarget && open) onClose();
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'bg-bg p-0 text-fg shadow-overlay backdrop:bg-overlay overscroll-contain',
        PLACEMENT_CLASSES[placement],
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] min-h-0 flex-col md:h-full">
          <div
            ref={headerRef}
            className="flex items-start justify-between gap-3 border-b border-border p-4"
          >
            <div>
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                  {description}
                </p>
              )}
            </div>
            <IconButton
              label={t('close')}
              icon={<CloseIcon />}
              onClick={onClose}
              className="-my-1 -mr-2"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}

/** Masaüstünde ortada pencere, mobilde alt sayfa. */
export function Modal(props: DialogProps) {
  return <BaseDialog {...props} placement="modal" />;
}

/** Mobilde alt sayfa, masaüstünde sağ yan panel (filtre ve ikincil işlemler için). */
export function Sheet(props: DialogProps) {
  return <BaseDialog {...props} placement="sheet" />;
}
