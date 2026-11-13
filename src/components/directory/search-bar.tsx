'use client';

import { useId } from 'react';
import type { ComponentProps, FormEvent, ReactNode } from 'react';

import { AlertIcon, Button, Input, cn } from '@/components/ui';

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
  /**
   * Gönderim sürerken verilir: "Ara" GERÇEKTEN `disabled` olur (çift gönderim yok) ve `aria-busy` taşır; sebep ("… yükleniyor")
   * satırı kaplamasın diye görünmez bir öğeye yazılır ve düğmeye `aria-describedby` ile bağlanır.
   */
  pendingReason?: string;
  action?: string;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  /** Dış boşluk çağırandan gelir (`mt-6`, `mb-4`…): bileşen kendi marjını koymaz, çünkü `cn` çakışan sınıfı ayıklamaz. */
  className?: string;
  /** Aynı formun içinde, arama satırının altına girer (örn. masaüstünde açılan süzgeç alanları: `q` ile birlikte gönderilir). */
  children?: ReactNode;
  /** Girdiye geçen alanlar: `name`, `value`/`defaultValue`, `onChange`, `maxLength`, `autoComplete`… */
  input: InputPassThrough;
};

/**
 * Dizin ve arama ekranlarının ORTAK tek satırlık arama bloğu (`/ilanlar`, `/deneyimler`, `/sirketler`): `[ara] [Ara] [Filtreler]`.
 * Etiket görünmez (yer tutucu ipucu verir), ipucu ayrı satır kaplamaz: telefonda ilk ekranın üst yarısı sonuçlara kalır. Etiket
 * yine de vardır (`label.sr-only`): yer tutucu etiketin yerini tutmaz. Satır DAR ekranda sarar: girdi en az 10 rem (160 px) kalır,
 * sığmayan "Filtreler" düğmesi (etkin filtre sayısıyla uzar: "Filtreler (3)") alt satıra iner; 360 px'te girdi 105 px'e düşüyordu.
 */
export function SearchBar({
  label,
  hint,
  submitLabel,
  error,
  trailing,
  pendingReason,
  action,
  onSubmit,
  className,
  children,
  input,
}: Props) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const pendingId = `${baseId}-pending`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;

  return (
    <form
      role="search"
      action={action}
      onSubmit={onSubmit}
      className={cn('rounded-card border border-border bg-surface p-3 shadow-sm sm:p-5', className)}
    >
      <div className="flex flex-wrap gap-2">
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
          className="min-w-40 flex-1"
        />
        <Button
          type="submit"
          className="shrink-0 whitespace-nowrap"
          loading={Boolean(pendingReason)}
          {...(pendingReason
            ? { disabled: true as const, disabledReasonId: pendingId }
            : { disabled: false as const })}
        >
          {submitLabel}
        </Button>
        {trailing}
      </div>
      {children}
      {pendingReason && (
        <span id={pendingId} className="sr-only">
          {pendingReason}
        </span>
      )}
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
