import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { requestEmailChange } from '@/server/actions/auth';
import { parseEmailChangeStep } from '@/contracts/auth';

import { EmailChangeForm } from './email-change-form';

export default async function EmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ adim?: string }>;
}) {
  const t = await getTranslations('authScreens.emailChange');
  const { adim } = await searchParams;
  const step = parseEmailChangeStep(adim);
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-lg flex-col px-5 pb-8 pt-12 sm:pt-20">
      {!step && (
        <Link
          href="/hesap"
          className="press-row mb-6 inline-flex min-h-11 items-center font-medium text-primary"
        >
          ← {t('back')}
        </Link>
      )}
      <header className="mb-10">
        <p className="mb-2 text-base font-semibold text-primary">{t('eyebrow')}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">
          {t(
            step === 'eski-onaylandi'
              ? 'oldVerifiedTitle'
              : step === 'tamamlandi'
                ? 'completeTitle'
                : 'title',
          )}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-fg-muted">
          {t(
            step === 'eski-onaylandi'
              ? 'oldVerifiedDescription'
              : step === 'tamamlandi'
                ? 'completeDescription'
                : 'description',
          )}
        </p>
      </header>
      {step ? (
        <Link
          href="/hesap"
          className="press-control inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 font-semibold text-white"
        >
          {t('back')}
        </Link>
      ) : (
        <EmailChangeForm submit={requestEmailChange} />
      )}
    </div>
  );
}
