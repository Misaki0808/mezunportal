'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { ChangeEvent, ComponentProps, FocusEvent } from 'react';

import { cn } from './cn';
import { CONTROL_BORDER_INVALID, CONTROL_BORDER_OK } from './controls';
import { UploadIcon } from './icons';

export type FilePickerProps = Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'children'
> & {
  /** `Field`'ın verdiği hata durumu; `aria-invalid` ve kırmızı çerçeve olur. */
  invalid?: boolean;
  /** Düğme yazısı, bağlama göre ("PDF seç"). Boşsa genel "Dosya seç". Dosya seçilince "Dosyayı değiştir" olur. */
  chooseLabel?: string;
  /**
   * Görünen dosya adı. Verilmezse seçilen dosyanın adı (dosya yoksa "Henüz dosya seçilmedi"). Üst bileşen reddettiği bir
   * dosyanın adını göstermemek için `''` verebilir.
   */
  fileName?: string;
};

/**
 * Tarayıcının yerli "Choose File · No file chosen" görünümü yerine tasarım sistemine uyan dosya seçici: düğme + dosya adı.
 * GERÇEK `<input type="file">` korunur ve tüm alanı örter (görünmez): tıklama, sürükle-bırak, klavye (Tab, Boşluk/Enter) ve
 * `FormData` okuması aynen çalışır. Etiket `Field` içindeki `<label htmlFor>` ile, dosya adı `aria-describedby` ile okunur;
 * düğme yazısı yalnız görseldir (`aria-hidden`), çünkü adı zaten etiket verir. Etiketsiz kullanılmaz: `Field` ile sarılır.
 */
/** Klavyeyle gelen odak (`:focus-visible`); dokunma/fare odağı değil. Eski motorda seçici yoksa `false`. */
function isKeyboardFocus(element: HTMLElement) {
  try {
    return element.matches(':focus-visible');
  } catch {
    return false;
  }
}

export function FilePicker({
  invalid,
  chooseLabel,
  fileName,
  className,
  onChange,
  onFocus,
  disabled,
  ...rest
}: FilePickerProps) {
  const t = useTranslations('ui.filePicker');
  const statusId = useId();
  const [picked, setPicked] = useState('');
  const name = fileName ?? picked;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setPicked(event.target.files?.[0]?.name ?? '');
    onChange?.(event);
    // Seçilen dosyanın adı sabit alt gezinmenin ve yapışkan eylem çubuğunun arkasında kalmasın (`scroll-above-bars` payı).
    event.target.scrollIntoView?.({ block: 'nearest' });
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    onFocus?.(event);
    // WebKit `focus()` ile kaydırmaz; klavyeyle gelen odakta alanı payın üstüne alırız. Dokunma/fare odağında kaydırmayız: basma
    // ile bırakma arasında sayfa kayarsa tıklama başka öğeye düşebilir (gerçek cihazda denenmedi, önlem).
    if (isKeyboardFocus(event.currentTarget)) {
      event.currentTarget.scrollIntoView?.({ block: 'nearest' });
    }
  }

  return (
    <div
      className={cn(
        'relative flex min-h-12 items-center gap-3 rounded-control border bg-bg p-1.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary',
        invalid ? CONTROL_BORDER_INVALID : CONTROL_BORDER_OK,
        disabled && 'cursor-not-allowed bg-surface-strong opacity-60',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-control bg-primary-soft px-3 text-base font-medium text-on-primary-soft"
      >
        <UploadIcon width={18} height={18} />
        {name ? t('change') : (chooseLabel ?? t('choose'))}
      </span>
      <span
        id={statusId}
        className={cn('min-w-0 flex-1 truncate text-base', name ? 'text-fg' : 'text-fg-muted')}
      >
        {name || t('empty')}
      </span>
      <input
        {...rest}
        type="file"
        disabled={disabled}
        aria-invalid={invalid || rest['aria-invalid']}
        aria-describedby={[statusId, rest['aria-describedby']].filter(Boolean).join(' ')}
        onChange={handleChange}
        onFocus={handleFocus}
        className="scroll-above-bars absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}
