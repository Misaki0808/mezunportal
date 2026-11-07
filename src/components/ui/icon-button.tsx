import type { ComponentProps, ReactNode } from 'react';

import { cn } from './cn';

export type IconButtonProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children'> & {
  /** Erişilebilir ad ZORUNLU: ikon tek başına anlam taşımaz. */
  label: string;
  icon: ReactNode;
  variant?: 'ghost' | 'secondary' | 'danger';
};

const VARIANTS = {
  ghost: 'text-fg hover:bg-surface-strong',
  secondary: 'border border-border-control bg-bg text-fg hover:bg-surface-strong',
  danger: 'text-danger hover:bg-danger-soft',
} as const;

/** Dokunma hedefi ≥ 44×44 px. */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cn(
        'press-control inline-flex size-11 shrink-0 items-center justify-center rounded-control',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    >
      {icon}
    </button>
  );
}
