import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { ChevronLeftIcon, PageHeader } from '@/components/ui';

type FrameWidth = 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl';

/**
 * Hesap ayarları alt sayfalarının ortak çerçevesi (kart 387, görünüm A): geri bağlantısı + `PageHeader` (üst etiket "Hesap") +
 * içerik. Kabuğun dolgusunu kendisi vermez (`AppShellClient`), yalnız okunur bir azami genişlik koyar ve sola yaslar.
 * Form düzeni değişmez: içerik `children` olarak aynen gelir. Metinler çağırandan gelir; istemci bileşenler bunu kullanır.
 */
export function AccountFrameView({
  title,
  description,
  children,
  eyebrow,
  backLabel,
  back,
  showBack = true,
  width = 'max-w-3xl',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  eyebrow: string;
  backLabel: string;
  /** Geri hedefi; varsayılan hesap ayarları. `href` güvenli site içi yol olmalıdır (`safeReturnPath`). */
  back?: { href: string };
  showBack?: boolean;
  width?: FrameWidth;
}) {
  return (
    <div className={`w-full ${width}`}>
      {showBack && (
        <Link
          href={back?.href ?? '/hesap'}
          className="press-row -ml-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-base font-medium text-primary hover:bg-primary-soft hover:text-on-primary-soft"
        >
          <ChevronLeftIcon aria-hidden="true" />
          {backLabel}
        </Link>
      )}
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-6 space-y-5">{children}</div>
    </div>
  );
}

/** Sunucu sayfaları için: varsayılan üst etiket ve geri metni `accountFrame` kataloğundan gelir. */
export async function AccountFrame({
  eyebrow,
  backLabel,
  ...rest
}: Omit<Parameters<typeof AccountFrameView>[0], 'eyebrow' | 'backLabel'> & {
  eyebrow?: string;
  backLabel?: string;
}) {
  const t = await getTranslations('accountFrame');
  return (
    <AccountFrameView
      {...rest}
      eyebrow={eyebrow ?? t('eyebrow')}
      backLabel={backLabel ?? t('back')}
    />
  );
}
