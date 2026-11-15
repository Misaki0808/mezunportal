import type { ReactNode } from 'react';

import { cn } from './cn';

export type PageHeaderProps = {
  /** Üst etiket (ör. “MENTORLAR”); metin katalogdan gelir. */
  eyebrow?: ReactNode;
  /** Sayfanın tek `h1`'i. */
  title: ReactNode;
  description?: ReactNode;
  /** Başlığın SAĞINDAKİ eylem(ler) (bilgisayarda aynı satırda, telefonda başlığın altında); birincil eylem tek ve belirgin olur. */
  actions?: ReactNode;
  /** Açıklamanın altındaki ek bilgi (ör. rozet satırı). */
  children?: ReactNode;
  className?: string;
};

/**
 * Sayfa başlığı: tek biçim (docs/design.md “Sayfa başlığı”, görünüm A). Üst etiket 12 px büyük harf ve ana renk, başlık
 * Plus Jakarta Sans 800 (telefonda 26, bilgisayarda 34 px), açıklama ikincil metin; eylemler bilgisayarda sağda. Her sayfa
 * kendi `h1/eyebrow` sınıflarını yazmaz; boyut ve boşluk burada değişir.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8',
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl">
        {eyebrow && (
          <p className="text-xs font-semibold tracking-[0.08em] text-primary uppercase">
            {eyebrow}
          </p>
        )}
        <h1
          className={cn(
            'break-words text-[1.625rem] leading-[1.15] font-extrabold tracking-tight text-fg sm:text-[2.125rem]',
            eyebrow ? 'mt-1.5' : null,
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-base leading-relaxed text-fg-muted">{description}</p>
        )}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5 lg:shrink-0">{actions}</div>}
    </header>
  );
}
