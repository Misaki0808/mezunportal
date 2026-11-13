import type { ComponentProps } from 'react';

import { cn } from './cn';

export type RadioProps = Omit<ComponentProps<'input'>, 'type'>;

/**
 * Kit radyo girdisi: `RadioGroup` seçeneğiyle AYNI çizim (24 px, `border-control` halka, seçiliyken `primary` dolu). Kendi etiket
 * kartını kuran ekranlar (geri bildirim büyük seçenekleri, SSS cevap kartları) tarayıcının gri 13–20 px yerli radyosu yerine bunu
 * kullanır. Etiket, grup başlığı ve hata bağlantısı çağıranın sorumluluğudur; bunlar gerekmiyorsa `RadioGroup` kullan.
 */
export function Radio({ className, ...rest }: RadioProps) {
  return (
    <input
      {...rest}
      type="radio"
      className={cn(
        'mt-0.5 size-6 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border-control bg-bg checked:border-[7px] checked:border-primary',
        className,
      )}
    />
  );
}
