import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/ui';

export async function PrivacyFrame({
  title,
  description,
  children,
  showBack = true,
  back,
}: {
  title: string;
  description: string;
  children: ReactNode;
  showBack?: boolean;
  /** Geri bağlantısı kaynağa dönsün (varsayılan: Hesabım). `href` güvenli site içi yol olmalıdır (`safeReturnPath`). */
  back?: { href: string };
}) {
  const t = await getTranslations('privacyScreens.common');
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-12">
      {showBack && (
        <Link
          href={back?.href ?? '/hesap'}
          className="press-row mb-6 inline-flex min-h-11 items-center text-base font-medium text-primary"
        >
          ← {back ? t('backReturn') : t('back')}
        </Link>
      )}
      <PageHeader eyebrow={t('eyebrow')} title={title} description={description} />
      <div className="mt-7 space-y-5">{children}</div>
    </div>
  );
}
