import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

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
      <p className="text-sm font-semibold tracking-wider text-primary">{t('eyebrow')}</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
      <p className="mt-3 text-base leading-relaxed text-fg-muted">{description}</p>
      <div className="mt-7 space-y-5">{children}</div>
    </div>
  );
}
