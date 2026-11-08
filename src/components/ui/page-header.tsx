import type { ReactNode } from 'react';

import { cn } from './cn';

export type PageHeaderProps = {
  /** Üst etiket (ör. “MENTORLAR”); metin katalogdan gelir. */
  eyebrow?: ReactNode;
  /** Sayfanın tek `h1`'i. */
  title: ReactNode;
  description?: ReactNode;
  /** Açıklamanın altındaki eylem(ler) ya da ek bilgi (ör. ikincil düğme, rozet satırı). */
  children?: ReactNode;
  className?: string;
};

/**
 * Sayfa başlığı: tek biçim (docs/design.md “Sayfa başlığı”). Üst etiket İris, başlık Plus Jakarta Sans (h1 kuralı),
 * açıklama ikincil metin. Her sayfa kendi `h1/eyebrow` sınıflarını yazmaz; boyut ve boşluk burada değişir.
 */
export function PageHeader({ eyebrow, title, description, children, className }: PageHeaderProps) {
  return (
    <header className={cn('max-w-2xl', className)}>
      {eyebrow && <p className="text-sm font-semibold tracking-wider text-primary">{eyebrow}</p>}
      <h1
        className={cn(
          'break-words text-3xl font-semibold tracking-tight text-fg sm:text-4xl',
          eyebrow ? 'mt-2' : null,
        )}
      >
        {title}
      </h1>
      {description && <p className="mt-3 text-base leading-relaxed text-fg-muted">{description}</p>}
      {children}
    </header>
  );
}
