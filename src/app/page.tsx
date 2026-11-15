import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getConsentState } from '@/server/actions/privacy';
import { getOnboardingState } from '@/server/actions/profile';
import { getHomeSummary, getSuggestedJobs } from '@/server/actions/home';
import { HomeDashboard } from '@/components/home/dashboard';
import { HomeStoryBand } from '@/components/home/widgets';
import { getMyMentorSettings, listMyAppointments } from '@/server/actions/appointment';
import { getSimilarMentors } from '@/server/actions/mentor-directory';
import { Landing } from '@/components/landing/landing';
import { getLandingStats } from '@/server/services/landing';
import { getCurrentStory } from '@/server/actions/alumni-story';
import { StoryInvite } from '@/components/alumni-story/showcase';
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
    twitter: {
      card: 'summary_large_image',
      title: t('metaTitle'),
      description: t('metaDescription'),
    },
  };
}

export default async function HomePage() {
  const [t, auth] = await Promise.all([
    getTranslations('home'),
    getTranslations('authScreens.home'),
  ]);
  const actor = await requireUserWithoutConsent().catch((error: unknown) => {
    unstable_rethrow(error);
    return null;
  });
  if (!actor) return <Landing stats={await getLandingStats()} />;
  if (actor) {
    const consent = await getConsentState();
    if (!consent.ok) return <ErrorState errorCode={consent.errorCode} />;
    if (consent.data.blocking) redirect('/onay');
  }
  const state = actor ? await getVerificationState().catch(() => null) : null;
  const needsVerification = state?.ok && state.data.status !== 'VERIFIED';
  const verified = actor && state?.ok && state.data.status === 'VERIFIED';
  const [onboarding, summary, story, settings] = verified
    ? await Promise.all([
        getOnboardingState().catch(() => null),
        getHomeSummary().catch(() => null),
        getCurrentStory().catch(() => null),
        getMyMentorSettings().catch(() => null),
      ])
    : [null, null, null, null];
  const showOnboarding = onboarding?.ok && onboarding.data.step !== 'COMPLETE';
  const storyTexts = await getTranslations('alumniStory');
  const isAlumnus = actor.facts.memberships.some(
    (m) => m.role === 'ALUMNI' && m.verificationStatus === 'VERIFIED' && m.endedAt === null,
  );
  const feature =
    story?.ok && story.data ? (
      <>
        <HomeStoryBand story={story.data} />
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
  // Sabit sayıda toplu çağrı: her ilan/mentor için ayrı istek yapılmaz. Randevu görünümü mevcut
  // randevular sayfasıyla aynı sunucu uygunluk kararını kullanır. Başvuru sayısı üretilmez.
  const [suggestedJobs, mentors, appointments] = summary?.ok
    ? await Promise.all([
        summary.data.role === 'STUDENT' ? getSuggestedJobs().catch(() => null) : null,
        summary.data.role === 'STUDENT' ? getSimilarMentors().catch(() => null) : null,
        listMyAppointments({
          role: settings?.ok && settings.data.eligible ? 'MENTOR' : 'MENTEE',
          statuses: ['CONFIRMED'],
          limit: 2,
        }).catch(() => null),
      ])
    : [null, null, null];
  const onboardingBanner = showOnboarding ? (
    <Link
      href="/baslangic"
      className="press-row flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-card border border-primary bg-primary-soft px-4 py-3 text-on-primary-soft"
    >
      <span className="text-lg font-semibold">{auth('onboardingTitle')}</span>
      <span className="text-base font-semibold underline underline-offset-4">
        {auth('onboardingAction')}
      </span>
    </Link>
  ) : null;
  return (
    <div className="flex w-full max-w-[1280px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
      {needsVerification && <h1 className="text-3xl font-semibold">{t('welcome')}</h1>}
      {needsVerification && (
        <Link
          href={
            state.data.status === 'NOT_STARTED' && state.data.emailKind !== 'OTHER'
              ? '/dogrulama/uyelik'
              : '/dogrulama'
          }
          className="press-row flex min-h-20 flex-col gap-2 rounded-card border border-primary bg-primary-soft p-5 text-on-primary-soft"
        >
          <span className="text-lg font-semibold">
            {auth(state.data.status === 'AWAITING_REVIEW' ? 'reviewTitle' : 'verificationTitle')}
          </span>
          <span className="text-base">
            {auth(
              state.data.status === 'AWAITING_REVIEW'
                ? 'reviewDescription'
                : state.data.status === 'NOT_STARTED' && state.data.emailKind === 'OTHER'
                  ? 'verificationDescriptionAlumni'
                  : 'verificationDescription',
            )}
          </span>
          <span className="text-base font-semibold underline underline-offset-4">
            {auth(state.data.status === 'AWAITING_REVIEW' ? 'reviewAction' : 'verificationAction')}
          </span>
        </Link>
      )}
      {!summary?.ok && onboardingBanner}
      {summary?.ok ? (
        <HomeDashboard
          summary={summary.data}
          feature={feature}
          notice={onboardingBanner}
          panels={{
            completion: onboarding?.ok ? onboarding.data.completion : null,
            appointments,
            jobs: suggestedJobs,
            mentors,
            settings,
          }}
        />
      ) : (
        <>
          {!needsVerification && <h1 className="text-3xl font-semibold">{t('title')}</h1>}
          <p className="text-base leading-relaxed">{t('tagline')}</p>
          {feature}
        </>
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
