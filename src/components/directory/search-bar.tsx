'use client';

import { useId } from 'react';
import type { ComponentProps, FormEvent, ReactNode } from 'react';

import { AlertIcon, Button, Input } from '@/components/ui';

type InputPassThrough = Omit<
  ComponentProps<typeof Input>,
  'type' | 'id' | 'aria-describedby' | 'invalid' | 'placeholder' | 'className'
>;

type Props = {
  /** Görünmez ama ekran okuyucunun okuduğu alan adı ("Deneyim ara"). */
  label: string;
  /** Ne yazılabileceğinin ipucu: yer tutucuda görünür ve ekran okuyucuya açıklama olarak verilir (ayrı satır kaplamaz). */
  hint?: string;
  submitLabel: string;
  /** Alanın altında, alanla ilişkili (`aria-describedby`) ve canlı bölgede gösterilen hata. */
  error?: string;
  /** Satırın sonuna, "Ara"nın yanına girer (örn. telefonda "Filtreler" düğmesi). */
  trailing?: ReactNode;
  /** Gönderim sürerken "Ara" kilitlenir ve duyurulur (`Button loading`); sebep satırı kaplamaz. */
  pending?: boolean;
  action?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Girdiye geçen alanlar: `name`, `value`/`defaultValue`, `onChange`, `maxLength`, `autoComplete`… */
  input: InputPassThrough;
};

/**
 * Dizin ve arama ekranlarının ORTAK tek satırlık arama bloğu (`/ilanlar` kalıbı): `[ara] [Ara] [Filtreler]`. Etiket görünmez
 * (yer tutucu ipucu verir), ipucu ayrı satır kaplamaz: telefonda ilk ekranın üst yarısı sonuçlara kalır. Etiket yine de vardır
 * (`label.sr-only`): yer tutucu etiketin yerini tutmaz.
 */
export function SearchBar({
  label,
  hint,
  submitLabel,
  error,
  trailing,
  pending,
  action,
  onSubmit,
  input,
}: Props) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <form
      role="search"
      action={action}
      onSubmit={onSubmit}
      className="mt-6 rounded-card border border-border bg-surface p-3 shadow-sm sm:p-5"
    >
      <div className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <Input
          {...input}
          id={inputId}
          type="search"
          placeholder={hint}
          aria-describedby={describedBy}
          invalid={error ? true : undefined}
          className="min-w-0 flex-1"
        />
        <Button type="submit" className="shrink-0 whitespace-nowrap" loading={pending}>
          {submitLabel}
        </Button>
        {trailing}
      </div>
      {hint && (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-2 flex items-start gap-1.5 text-sm text-danger">
          <AlertIcon className="mt-0.5 shrink-0" width={16} height={16} />
          <span>{error}</span>
        </p>
      )}
    </form>
  );
}
