import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getConsentState } from '@/server/actions/privacy';
import { getOnboardingState } from '@/server/actions/profile';
import { ErrorState } from '@/components/ui';

import { getVerificationState } from '@/server/actions/auth';
import { requireUser } from '@/server/permissions';

export default async function HomePage() {
  const [t, auth] = await Promise.all([
    getTranslations('home'),
    getTranslations('authScreens.home'),
  ]);
  const actor = await requireUser().catch(() => null);
  if (actor) {
    const consent = await getConsentState();
    if (!consent.ok) return <ErrorState errorCode={consent.errorCode} />;
    if (consent.data.blocking) redirect('/onay');
  }
  const state = actor ? await getVerificationState().catch(() => null) : null;
  const needsVerification = state?.ok && state.data.status !== 'VERIFIED';
  const onboarding =
    actor && state?.ok && state.data.status === 'VERIFIED'
      ? await getOnboardingState().catch(() => null)
      : null;
  const showOnboarding = onboarding?.ok && onboarding.data.step !== 'COMPLETE';
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
      {showOnboarding && (
        <Link
          href="/baslangic"
          className="press-row flex min-h-20 flex-col gap-2 rounded-card border border-primary bg-primary-soft p-5 text-on-primary-soft"
        >
          <span className="text-lg font-semibold">{auth('onboardingTitle')}</span>
          <span className="text-base">{auth('onboardingDescription')}</span>
          <span className="text-base font-semibold underline underline-offset-4">
            {auth('onboardingAction')}
          </span>
        </Link>
      )}
      <h1 className="text-3xl font-semibold">{t('title')}</h1>
      <p className="text-base leading-relaxed">{t('tagline')}</p>
    </div>
  );
}
