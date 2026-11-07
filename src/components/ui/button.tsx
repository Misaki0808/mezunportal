'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';

import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border-control bg-bg text-fg hover:bg-surface-strong',
  ghost: 'bg-transparent text-primary hover:bg-primary-soft',
  danger: 'bg-danger text-on-danger hover:bg-danger-hover',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-12 px-6 text-lg',
};

/** Bağlantıları (`<a>`/`next/link`) düğme gibi biçimlemek için: dokunma hedefi ≥ 44 px, basınca küçülür. */
export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean } = {}): string {
  return cn(
    'press-control inline-flex items-center justify-center gap-2 rounded-control font-medium',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && 'w-full',
  );
}

/**
 * Devre dışı düğme SEBEBİNİ yazar (docs/design.md): `disabled` verildiğinde `disabledReason`
 * zorunludur (tip düzeyinde) ve düğmenin altında görünür, `aria-describedby` ile bağlanır.
 */
type DisabledProps =
  { disabled?: false; disabledReason?: undefined } | { disabled: true; disabledReason: string };

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
      className="animate-spin"
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
      aria-describedby={cn(disabledReason && reasonId, describedBy) || undefined}
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
