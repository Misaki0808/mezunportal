'use client';

import { useId } from 'react';

import { cn } from './cn';
import { AlertIcon } from './icons';

export type RadioOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type RadioGroupProps = {
  /** Grup adı (`<legend>`): ekran okuyucu her seçenekte önce bunu okur. */
  legend: string;
  name: string;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
};

export function RadioGroup({
  legend,
  name,
  options,
  value,
  defaultValue,
  onValueChange,
  hint,
  error,
  required,
  className,
}: RadioGroupProps) {
  const baseId = useId();
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <fieldset
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
      className={cn('flex flex-col gap-1', className)}
    >
      <legend className="mb-1 font-medium text-fg">{legend}</legend>
      {hint && (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      )}
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-11 cursor-pointer items-start gap-3 py-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            disabled={option.disabled}
            required={required}
            {...(value !== undefined
              ? { checked: value === option.value }
              : { defaultChecked: defaultValue === option.value })}
            onChange={() => onValueChange?.(option.value)}
            className="mt-0.5 size-6 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border-control bg-bg checked:border-[7px] checked:border-primary"
          />
          <span className="flex flex-col">
            <span className="text-base text-fg">{option.label}</span>
            {option.description && (
              <span className="text-sm text-fg-muted">{option.description}</span>
            )}
          </span>
        </label>
      ))}
      {error && (
        <p id={errorId} role="alert" className="flex items-start gap-1.5 text-sm text-danger">
          <AlertIcon className="mt-0.5 shrink-0" width={16} height={16} />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  );
}
