import type { ComponentProps } from 'react';

import { cn } from './cn';
import { CONTROL_BASE, CONTROL_BORDER_INVALID, CONTROL_BORDER_OK } from './controls';

/**
 * Etiketsiz kullanılmaz: `Field` ile sarılır (etiket, hata ve yardım ilişkisi orada kurulur).
 * Mobil klavye için `inputMode`, `autoComplete` ve `type` her kullanımda doğru verilir.
 */
export type InputProps = ComponentProps<'input'> & { invalid?: boolean };

export function Input({ invalid, className, type = 'text', ...rest }: InputProps) {
  return (
    <input
      {...rest}
      type={type}
      aria-invalid={invalid || rest['aria-invalid']}
      className={cn(
        CONTROL_BASE,
        invalid ? CONTROL_BORDER_INVALID : CONTROL_BORDER_OK,
        // iOS odaklanınca yakınlaştırmasın: en az 16 px
        'text-base',
        className,
      )}
    />
  );
}
