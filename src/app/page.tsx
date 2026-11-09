import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getConsentState } from '@/server/actions/privacy';
import { getOnboardingState } from '@/server/actions/profile';
import { getHomeSummary, getSuggestedJobs } from '@/server/actions/home';
import { HomeDashboard } from '@/components/home/dashboard';
import { Landing } from '@/components/landing/landing';
import { getLandingStats } from '@/server/services/landing';
import { getCurrentStory } from '@/server/actions/alumni-story';
import { StoryInvite, StoryShowcase } from '@/components/alumni-story/showcase';
import type { Metadata } from 'next';
import { ErrorState } from '@/components/ui';

import { getVerificationState } from '@/server/actions/auth';
import { requireUserWithoutConsent } from '@/server/permissions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing');
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    openGraph: { title: t('metaTitle'), description: t('metaDescription'), type: 'website' },
  };
}

export default async function HomePage() {
  const [t, auth] = await Promise.all([
    getTranslations('home'),
    getTranslations('authScreens.home'),
  ]);
  const actor = await requireUserWithoutConsent().catch(() => null);
  if (!actor) return <Landing stats={await getLandingStats()} />;
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
  const verified = actor && state?.ok && state.data.status === 'VERIFIED';
  const summary = verified ? await getHomeSummary().catch(() => null) : null;
  const story = verified ? await getCurrentStory().catch(() => null) : null;
  const storyTexts = await getTranslations('alumniStory');
  const isAlumnus = actor.facts.memberships.some(
    (m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
  );
  const feature =
    story?.ok && story.data ? (
      <>
        <StoryShowcase story={story.data} />
        <Link
          href="/hikayeler"
          className="inline-flex min-h-11 items-center font-semibold text-primary underline"
        >
          {storyTexts('archive')}
        </Link>
      </>
    ) : story?.ok && isAlumnus ? (
      <StoryInvite />
    ) : story && !story.ok ? (
      <ErrorState errorCode={story.errorCode} />
    ) : null;
  const suggestedJobs =
    summary?.ok && summary.data.role === 'STUDENT'
      ? await getSuggestedJobs().catch(() => null)
      : null;
  return (
    <div
      className={`mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 sm:py-12 ${!actor ? 'min-h-[calc(100dvh-8rem)]' : ''}`}
    >
      {needsVerification && (
        <Link
          href="/dogrulama"
          className="press-row flex min-h-20 flex-col gap-2 rounded-card border border-primary bg-primary-soft p-5 text-on-primary-soft"
        >
          <span className="text-lg font-semibold">
            {auth(state.data.status === 'AWAITING_REVIEW' ? 'reviewTitle' : 'verificationTitle')}
          </span>
          <span className="text-base">
            {auth(
              state.data.status === 'AWAITING_REVIEW'
                ? 'reviewDescription'
                : 'verificationDescription',
            )}
          </span>
          <span className="text-base font-semibold underline underline-offset-4">
            {auth(state.data.status === 'AWAITING_REVIEW' ? 'reviewAction' : 'verificationAction')}
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
      {summary?.ok ? (
        <HomeDashboard summary={summary.data} feature={feature} />
      ) : (
        <>
          <h1 className="text-3xl font-semibold">{t('title')}</h1>
          <p className="text-base leading-relaxed">{t('tagline')}</p>
          {feature}
        </>
      )}
      {suggestedJobs?.ok && (
        <section aria-labelledby="home-job-matches" className="flex flex-col gap-3">
          <h2 id="home-job-matches" className="text-xl font-semibold">
            {t('jobMatches.title')}
          </h2>
          {suggestedJobs.data.length ? (
            <ul className="flex flex-col gap-2">
              {suggestedJobs.data.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/ilanlar/${job.id}`}
                    className="press-row flex min-h-14 flex-col rounded-card border border-border p-4"
                  >
                    <span className="font-semibold">{job.title}</span>
                    <span className="text-fg-muted">{job.organizationName}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fg-muted">
              {t('jobMatches.empty')}{' '}
              <Link className="font-semibold text-primary underline" href="/profil">
                {t('jobMatches.profile')}
              </Link>
            </p>
          )}
        </section>
      )}
      {!actor && (
        <Link
          href="/giris"
          className="press-control mt-auto inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 font-semibold text-on-primary"
        >
          {auth('signIn')}
        </Link>
      )}
    </div>
  );
}
