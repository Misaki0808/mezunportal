import type { ComponentProps } from 'react';

import { cn } from './cn';
import { CONTROL_BASE, CONTROL_BORDER_INVALID, CONTROL_BORDER_OK } from './controls';

export type TextareaProps = ComponentProps<'textarea'> & { invalid?: boolean };

export function Textarea({ invalid, className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      {...rest}
      rows={rows}
      aria-invalid={invalid || rest['aria-invalid']}
      className={cn(
        CONTROL_BASE,
        invalid ? CONTROL_BORDER_INVALID : CONTROL_BORDER_OK,
        'resize-y',
        className,
      )}
    />
  );
}
