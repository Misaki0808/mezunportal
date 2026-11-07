'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from './cn';
import { AlertIcon, InfoIcon } from './icons';
import { IconButton } from './icon-button';

/** `Field`'ın kontrole verdiği özellikler: `<Input {...props} />` olarak yayılır. */
export type FieldControlProps = {
  id: string;
  'aria-describedby'?: string;
  invalid?: boolean;
  required?: boolean;
};

export type FieldProps = {
  label: string;
  /** Kısa, her zaman görünen ipucu (uzun açıklama için `help` kullan). */
  hint?: string;
  /** Uzun açıklama: “i” düğmesiyle açılır; paragraf olarak sayfayı doldurmaz. */
  help?: ReactNode;
  /** Hata alanın ALTINDA, alanla ilişkili (`aria-describedby`) ve canlı bölgede gösterilir. */
  error?: string;
  required?: boolean;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
};

/**
 * Etiket + ipucu + “i” yardım + hata. Etiket placeholder'a bırakılmaz; etiket, hata ve yardım
 * kontrole `id` / `aria-describedby` ile bağlanır.
 */
export function Field({ label, hint, help, error, required, className, children }: FieldProps) {
  const t = useTranslations('ui.field');
  const baseId = useId();
  const controlId = `${baseId}-control`;
  const hintId = `${baseId}-hint`;
  const helpId = `${baseId}-help`;
  const errorId = `${baseId}-error`;
  const [helpOpen, setHelpOpen] = useState(false);

  const describedBy =
    [hint && hintId, help && helpOpen && helpId, error && errorId].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={controlId} className="font-medium text-fg">
          {label}
          {required && (
            <>
              <span aria-hidden="true" className="text-danger">
                {' '}
                *
              </span>
              <span className="sr-only"> ({t('required')})</span>
            </>
          )}
        </label>
        {help && (
          <IconButton
            label={t('toggleHelp')}
            icon={<InfoIcon />}
            aria-expanded={helpOpen}
            aria-controls={helpId}
            onClick={() => setHelpOpen((open) => !open)}
            className="-my-2 -mr-2"
          />
        )}
      </div>
      {help && (
        <div
          id={helpId}
          hidden={!helpOpen}
          className="rounded-control bg-primary-soft p-3 text-sm text-on-primary-soft"
        >
          {help}
        </div>
      )}
      {hint && (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      )}
      {children({
        id: controlId,
        'aria-describedby': describedBy,
        invalid: error ? true : undefined,
        required,
      })}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <AlertIcon className="mt-0.5 shrink-0" width={16} height={16} />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
