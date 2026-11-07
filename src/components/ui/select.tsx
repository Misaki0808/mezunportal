import type { ComponentProps } from 'react';

import { cn } from './cn';
import { CONTROL_BASE, CONTROL_BORDER_INVALID, CONTROL_BORDER_OK } from './controls';
import { ChevronDownIcon } from './icons';

export type SelectProps = ComponentProps<'select'> & { invalid?: boolean };

/** Yerel `<select>`: mobil seçiciler, klavye ve ekran okuyucu davranışı tarayıcıdan gelir. */
export function Select({ invalid, className, children, ...rest }: SelectProps) {
  return (
    <span className="relative block">
      <select
        {...rest}
        aria-invalid={invalid || rest['aria-invalid']}
        className={cn(
          CONTROL_BASE,
          invalid ? CONTROL_BORDER_INVALID : CONTROL_BORDER_OK,
          'appearance-none pr-10',
          className,
        )}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-muted" />
    </span>
  );
}
