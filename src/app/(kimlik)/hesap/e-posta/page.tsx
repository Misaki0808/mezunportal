import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { requestEmailChange } from '@/server/actions/auth';
import { parseEmailChangeStep } from '@/contracts/auth';

import { EmailChangeForm } from './email-change-form';
import { AccountFrame } from '@/components/account/account-frame';

export default async function EmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ adim?: string }>;
}) {
  const t = await getTranslations('authScreens.emailChange');
  const { adim } = await searchParams;
  const step = parseEmailChangeStep(adim);
  return (
    <AccountFrame
      showBack={!step}
      width="max-w-2xl"
      eyebrow={t('eyebrow')}
      backLabel={t('back')}
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
    >
      <div className="max-w-lg">
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
    </AccountFrame>
  );
}
