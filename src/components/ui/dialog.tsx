'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import { cn } from './cn';
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
    } else if (!open && dialog.open) {
      dialog.close();
    }
    if (!open && returnFocusRef.current instanceof HTMLElement) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

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
        // Esc: tarayıcının kendiliğinden kapatmasını durdur; durumu çağıran yönetir.
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        // Tarayıcı yine de kapattıysa (örn. ikinci Esc) durum eşitlenir.
        if (open) onClose();
      }}
      onClick={handleBackdropClick}
      className={cn(
        'bg-bg p-0 text-fg shadow-overlay backdrop:bg-overlay',
        PLACEMENT_CLASSES[placement],
      )}
    >
      {open && (
        <div className="flex max-h-[inherit] min-h-0 flex-col md:h-full">
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
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
