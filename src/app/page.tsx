import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { getVerificationState } from '@/server/actions/auth';
import { requireUser } from '@/server/permissions';

export default async function HomePage() {
  const [t, auth] = await Promise.all([
    getTranslations('home'),
    getTranslations('authScreens.home'),
  ]);
  const actor = await requireUser().catch(() => null);
  const state = actor ? await getVerificationState().catch(() => null) : null;
  const needsVerification = state?.ok && state.data.status !== 'VERIFIED';
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-12">
      {needsVerification && (
        <Link
          href="/dogrulama"
          className="press-row flex min-h-20 flex-col gap-2 rounded-card border border-primary bg-primary-soft p-5 text-on-primary-soft"
        >
          <span className="text-lg font-semibold">{auth('verificationTitle')}</span>
          <span className="text-base">{auth('verificationDescription')}</span>
          <span className="text-base font-semibold underline underline-offset-4">
            {auth('verificationAction')}
          </span>
        </Link>
      )}
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-base leading-relaxed">{t('tagline')}</p>
    </div>
  );
}
