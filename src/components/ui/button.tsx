'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';

import { cn } from './cn';
import { buttonClasses } from './button-classes';
import type { ButtonSize, ButtonVariant } from './button-classes';

export { buttonClasses };
export type { ButtonSize, ButtonVariant };

/**
 * Devre dışı düğme SEBEBİNİ yazar (docs/design.md): `disabled` verildiğinde `disabledReason`
 * zorunludur (tip düzeyinde) ve düğmenin altında görünür, `aria-describedby` ile bağlanır.
 */
type DisabledProps =
  | { disabled?: false; disabledReason?: undefined; disabledReasonId?: undefined }
  | { disabled: true; disabledReason: string; disabledReasonId?: undefined }
  /**
   * Sebep sayfada BAŞKA yerde görünür (örn. alanın altındaki ipucu): düğmenin altında tekrarlanmaz, `aria-describedby` o öğeye
   * bağlanır. Aynı sebebi paylaşan düğme grubunda (satır eylemleri) metin her düğmenin altında yinelenmesin diye kullanılır.
   */
  | { disabled: true; disabledReason?: undefined; disabledReasonId: string };

export type ButtonProps = Omit<ComponentProps<'button'>, 'disabled'> &
  DisabledProps & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    fullWidth?: boolean;
    /** Gönderim sürerken düğme kilitlenir (çift gönderim yok) ve ekran okuyucuya duyurulur. */
    loading?: boolean;
    leadingIcon?: ReactNode;
  };

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
      className="animate-spin motion-reduce:animate-none"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  leadingIcon,
  disabled = false,
  disabledReason,
  disabledReasonId,
  className,
  children,
  type = 'button',
  onClick,
  'aria-describedby': describedBy,
  ...rest
}: ButtonProps) {
  const t = useTranslations('ui.button');
  const reasonId = useId();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (loading) {
      // Yükleniyorken ikinci tıklama form göndermez, eylemi tekrarlamaz.
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  const button = (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      aria-describedby={cn(disabledReason && reasonId, disabledReasonId, describedBy) || undefined}
      onClick={handleClick}
      className={cn(buttonClasses({ variant, size, fullWidth }), className)}
    >
      {loading ? <Spinner /> : leadingIcon}
      {children}
      {loading && <span className="sr-only">{t('loading')}</span>}
    </button>
  );

  if (!disabledReason) return button;

  return (
    <span className={cn('inline-flex flex-col items-start gap-1', fullWidth && 'w-full')}>
      {button}
      <span id={reasonId} className="text-sm text-fg-muted">
        {disabledReason}
      </span>
    </span>
  );
}
