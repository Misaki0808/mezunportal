import { cn } from './cn';

export type AvatarProps = {
  /** Kişinin adı: görsel yoksa baş harfler gösterilir; görsel varsa `alt` olur. */
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Ad avatarın yanında zaten yazıyorsa true: ekran okuyucu tekrar okumaz. */
  decorative?: boolean;
  className?: string;
};

const SIZES = { sm: 'size-8 text-xs', md: 'size-11 text-base', lg: 'size-16 text-xl' } as const;

/** Türkçe harfler için `tr-TR` büyük harf (i → İ). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toLocaleUpperCase('tr-TR');
}

export function Avatar({ name, src, size = 'md', decorative = false, className }: AvatarProps) {
  const shared = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-on-primary-soft',
    SIZES[size],
    className,
  );

  if (src) {
    return (
      // Küçük, sabit boyutlu kullanıcı görseli; next/image uzak alan yapılandırması gerektirir.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={decorative ? '' : name}
        className={cn(shared, 'object-cover')}
        width={64}
        height={64}
      />
    );
  }

  return (
    <span
      className={shared}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
    >
      <span aria-hidden="true">{initialsOf(name)}</span>
    </span>
  );
}
