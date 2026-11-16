'use client';

import { useState } from 'react';
import { profilePhotoHref } from '@/contracts/profile-photo';
import { cn } from './cn';

export type AvatarProps = {
  /** Kişinin adı: görsel yoksa baş harfler gösterilir; görsel varsa `alt` olur. */
  name: string;
  userId?: string;
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

export function Avatar({
  name,
  src: providedSrc,
  userId,
  size = 'md',
  decorative = false,
  className,
}: AvatarProps) {
  const source =
    providedSrc ?? (userId ? profilePhotoHref(userId, size === 'lg' ? 512 : 96) : undefined);
  const src =
    size === 'lg' && source?.startsWith('/api/profil-fotografi/')
      ? source.replace('size=96', 'size=512')
      : source;
  const [failedSrc, setFailedSrc] = useState<string>();
  const shared = cn(
    'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft font-semibold text-on-primary-soft',
    SIZES[size],
    className,
  );

  if (src && failedSrc !== src) {
    return (
      // Yetkili rota tarayıcı çerezini alır; görsel genel next/image önbelleğine sokulmaz.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        onError={() => setFailedSrc(src)}
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
