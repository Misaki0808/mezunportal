import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { requestEmailChange } from '@/server/actions/auth';
import { parseEmailChangeStep } from '@/contracts/auth';

import { EmailChangeForm } from './email-change-form';
import { PageHeader } from '@/components/ui';

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
      <PageHeader
        className="mb-10"
        eyebrow={t('eyebrow')}
        title={t(
          step === 'eski-onaylandi'
            ? 'oldVerifiedTitle'
            : step === 'tamamlandi'
              ? 'completeTitle'
              : 'title',
        )}
        description={t(
          step === 'eski-onaylandi'
            ? 'oldVerifiedDescription'
            : step === 'tamamlandi'
              ? 'completeDescription'
              : 'description',
        )}
      />
      {step ? (
        <Link
          href="/hesap"
          className="press-control inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 font-semibold text-on-primary"
        >
          {t('back')}
        </Link>
      ) : (
        <EmailChangeForm submit={requestEmailChange} />
      )}
    </div>
  );
}
