import type { ComponentProps } from 'react';

import { cn } from './cn';

export type SwitchProps = Omit<ComponentProps<'input'>, 'type' | 'role' | 'children'> & {
  label: string;
  description?: string;
};

/** Yerel onay kutusu `role="switch"` ile: durum ekran okuyucuya “açık/kapalı” olarak gider. */
export function Switch({ label, description, className, ...rest }: SwitchProps) {
  return (
    <label
      className={cn(
        'flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2',
        className,
      )}
    >
      <span className="flex flex-col">
        <span className="text-base text-fg">{label}</span>
        {description && <span className="text-sm text-fg-muted">{description}</span>}
      </span>
      <span className="relative inline-flex h-7 w-12 shrink-0">
        <input
          {...rest}
          type="checkbox"
          role="switch"
          className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full border-2 border-border-control bg-surface-strong checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 left-1 size-5 rounded-full bg-border-control transition-transform peer-checked:translate-x-5 peer-checked:bg-on-primary"
        />
      </span>
    </label>
  );
}
