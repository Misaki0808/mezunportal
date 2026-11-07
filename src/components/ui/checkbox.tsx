import type { ComponentProps } from 'react';

import { cn } from './cn';
import { CheckIcon } from './icons';

export type CheckboxProps = Omit<ComponentProps<'input'>, 'type' | 'children'> & {
  label: string;
  description?: string;
};

/** Etiket kutunun parçasıdır: tüm satır tıklanır ve dokunma hedefi ≥ 44 px olur. */
export function Checkbox({ label, description, className, ...rest }: CheckboxProps) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-start gap-3 py-2', className)}>
      <span className="relative mt-0.5 inline-flex size-6 shrink-0">
        <input
          {...rest}
          type="checkbox"
          className="peer size-6 cursor-pointer appearance-none rounded-md border-2 border-border-control bg-bg checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        <CheckIcon
          width={16}
          height={16}
          strokeWidth={3}
          className="pointer-events-none absolute top-1 left-1 hidden text-on-primary peer-checked:block"
        />
      </span>
      <span className="flex flex-col">
        <span className="text-base text-fg">{label}</span>
        {description && <span className="text-sm text-fg-muted">{description}</span>}
      </span>
    </label>
  );
}
